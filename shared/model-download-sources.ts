// Download mirrors for the pinned model catalogs (ASR tiers + model packs).
//
// Shared by two callers so a mirror is described in exactly one place:
//   • server/plugins/hf-proxy.ts — the runtime, on-demand download channel.
//   • desktop/fetch-bundled-models.mts — the build-time fetch for models that
//     ship inside the desktop installer.
//
// Every URL is built from a catalog-pinned (modelId, revision, filePath)
// tuple. There is no unpinned/"main" download path: callers verify the bytes
// against the catalog's size + SHA-256 after the transfer.

export interface PinnedModelFileTarget {
  readonly modelId: string;
  readonly revision: string;
  readonly filePath: string;
}

export interface ModelDownloadSource {
  readonly name: string;
  readonly url: (target: PinnedModelFileTarget) => string;
  /** ModelScope is a domestic CDN — reach it directly, never through the outbound proxy. */
  readonly direct?: boolean;
}

/**
 * Sources in priority order. ModelScope is first: measured 22.9MB/s direct (no
 * proxy) vs ~90KB/s for huggingface.co via proxy on this machine; its mirrored
 * files byte-match HF (sha-verified against the pinned catalog).
 */
export const MODEL_DOWNLOAD_SOURCES: readonly ModelDownloadSource[] = [
  {
    name: 'modelscope',
    direct: true,
    url: (target) => `https://modelscope.cn/api/v1/models/${target.modelId}/repo?Revision=master&FilePath=${target.filePath}`,
  },
  {
    name: 'huggingface',
    url: (target) => `https://huggingface.co/${target.modelId}/resolve/${target.revision}/${target.filePath}`,
  },
  {
    name: 'hf-cdn',
    url: (target) => `https://hf-cdn.sufy.com/${target.modelId}/resolve/${target.revision}/${target.filePath}`,
  },
  {
    name: 'hf-mirror',
    url: (target) => `https://hf-mirror.com/${target.modelId}/resolve/${target.revision}/${target.filePath}`,
  },
];

/** Every mirror URL for one pinned catalog file, in priority order. */
export function modelDownloadUrls(
  target: PinnedModelFileTarget,
): readonly { readonly name: string; readonly url: string; readonly direct: boolean }[] {
  return MODEL_DOWNLOAD_SOURCES.map((source) => ({
    name: source.name,
    url: source.url(target),
    direct: source.direct === true,
  }));
}
