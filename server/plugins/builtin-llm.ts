// Routes for the built-in HyperFrames model's one-time download.
//
//   GET  /api/builtin-llm          → { status, bytesDone, bytesTotal, … }
//   POST /api/builtin-llm/download → start or resume, in the background
//   POST /api/builtin-llm/pause    → stop, keep the bytes
//   POST /api/builtin-llm/decline  → stop, and stop asking
//
// Mutations are gated exactly like the model-pack ones: an editor credential and
// a JSON content type, so a page in another tab cannot start a 2.3 GiB transfer
// on someone's connection.
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { editorCredentialAuthorized } from '../editor-auth.ts';
import {
  AUTO_DOWNLOAD_DELAY_MS,
  builtinLlmDownloadState,
  declineBuiltinLlmDownload,
  maybeAutoStartBuiltinLlmDownload,
  pauseBuiltinLlmDownload,
  startBuiltinLlmDownload,
  type BuiltinLlmDownloadDeps,
} from '../builtin-llm/download.ts';
import { resolveHyperframesLlm } from './hyperframes.ts';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Has the user picked a model themselves? `resolveHyperframesLlm` answers with
 * the full precedence rule, and `builtin: false` is what separates "chose a
 * vendor" from "is falling back to the local weights".
 */
function vendorConfigured(): boolean {
  const selection = resolveHyperframesLlm();
  return selection.configured && !selection.builtin;
}

const deps: BuiltinLlmDownloadDeps = { providerConfigured: vendorConfigured };

function requireMutation(req: IncomingMessage, res: ServerResponse): boolean {
  if (!editorCredentialAuthorized(req, true)) {
    req.resume();
    sendJson(res, 401, { error: 'editor credential required' });
    return false;
  }
  const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (contentType !== 'application/json') {
    req.resume();
    sendJson(res, 415, { error: 'content-type must be application/json' });
    return false;
  }
  req.resume();
  return true;
}

export async function handleBuiltinLlmRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  if (pathname === '/api/builtin-llm' && req.method === 'GET') {
    sendJson(res, 200, await builtinLlmDownloadState(deps));
    return;
  }
  const action = /^\/api\/builtin-llm\/(download|pause|decline)$/.exec(pathname)?.[1];
  if (!action || req.method !== 'POST') {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  if (!requireMutation(req, res)) return;
  const state = action === 'download'
    ? await startBuiltinLlmDownload(deps)
    : action === 'pause'
      ? await pauseBuiltinLlmDownload(deps)
      : await declineBuiltinLlmDownload(deps);
  sendJson(res, 200, state);
}

export function builtinLlmPlugin(): Plugin {
  return {
    name: 'openchatcut-builtin-llm',
    configureServer(server) {
      // Fire and forget, after a beat. The window has to open first; a first
      // launch that stalls on a model download is a worse product than one that
      // quietly fills the model in while you work.
      const timer = setTimeout(() => {
        void maybeAutoStartBuiltinLlmDownload(deps).then((decision) => {
          if (decision === 'start') {
            server.config.logger.info('[builtin-llm] fetching the built-in graphics model in the background');
          }
        }).catch((error: unknown) => {
          server.config.logger.warn(
            `[builtin-llm] auto-download could not start: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, AUTO_DOWNLOAD_DELAY_MS);
      timer.unref?.();
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        if (!pathname.startsWith('/api/builtin-llm')) {
          next();
          return;
        }
        void handleBuiltinLlmRequest(req, res, pathname).catch((error: unknown) => {
          sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        });
      });
    },
  };
}
