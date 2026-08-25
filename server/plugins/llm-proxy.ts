import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { getKey, type KeyName } from '../keystore.ts';
import {
  normalizeLlmProvider,
  llmProviderPreset,
  protocolForProvider,
  type LlmProvider,
} from '../../shared/llm-providers.ts';
import { resolveLlmProviderConfig } from '../llm-config.ts';
import { xaiOauthAccessToken } from '../xai-oauth-session.ts';
import { proxyMiddleware } from '../proxy.ts';

function keyReader(name: string): string {
  return getKey(name as KeyName);
}

export function llmProviderForRequest(req?: IncomingMessage): LlmProvider {
  const requested = req?.headers['x-openchatcut-provider'];
  return normalizeLlmProvider(typeof requested === 'string' ? requested : getKey('LLM_PROVIDER'));
}

export function llmTarget(req?: IncomingMessage): string {
  return resolveLlmProviderConfig(llmProviderForRequest(req), keyReader).baseUrl;
}

export function llmHeaders(req?: IncomingMessage): Record<string, string> {
  const config = resolveLlmProviderConfig(llmProviderForRequest(req), keyReader);
  if (config.provider === 'xai-oauth') {
    // OAuth requests only trust the active in-memory session. API-key accounts
    // use the separate xai provider and LLM_XAI_API_KEY slot.
    const token = xaiOauthAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }
  if (!config.apiKey) return {};
  const protocol = protocolForProvider(config.provider);
  if (protocol === 'anthropic') return { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' };
  if (protocol === 'google') return { 'x-goog-api-key': config.apiKey };
  return { authorization: `Bearer ${config.apiKey}` };
}

export function llmErrorMessage(status: number, req?: IncomingMessage): string {
  const provider = llmProviderForRequest(req);
  const label = llmProviderPreset(provider).label;
  if (provider === 'xai-oauth' && (status === 401 || status === 403)) {
    return status === 403
      ? 'xAI declined the subscription session\'s API access (your current subscription tier may not include this). Upgrade your subscription, or configure an API key instead on the "Settings -> Agent Models -> xAI Grok" page.'
      : 'The xAI subscription session has expired. Run "grok login" in a terminal to sign in again, then click import on the "Settings -> Agent Models -> xAI Grok (subscription login)" page.';
  }
  if (status === 401 || status === 403) {
    return `${label} authentication failed. Check the API key under "Settings -> Agent Models".`;
  }
  if (status === 402 || status === 429) {
    return `${label} is out of credit or being rate-limited. Check your account balance and try again later.`;
  }
  if (status === 404) {
    return `${label}'s endpoint or model doesn't exist. Check the base URL and model name.`;
  }
  if (status >= 500) {
    return `${label} is temporarily unavailable (HTTP ${status}). Try again later or switch models.`;
  }
  return `${label} request failed (HTTP ${status}). Check the connection settings under "Settings -> Agent Models".`;
}

/** One dynamic proxy implementation shared by Vite dev and Electron production. */
export function llmProxyPlugin(): Plugin {
  return {
    name: 'openchatcut-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/llm', proxyMiddleware({
        target: llmTarget,
        headers: llmHeaders,
        forceJsonContentType: true,
        errorMessage: llmErrorMessage,
      }));
    },
  };
}
