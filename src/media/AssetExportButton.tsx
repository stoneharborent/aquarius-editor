import { useState } from 'react';
import type { MediaAsset } from '../editor/types';
import { useT } from '../i18n/locale';
import { exportMediaAsset } from './assetExport';

interface AssetExportButtonProps {
  asset: MediaAsset;
  fps: number;
  onError: (message: string) => void;
  onComplete?: () => void;
}

export function AssetExportButton({ asset, fps, onError, onComplete }: AssetExportButtonProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const label = asset.kind === 'motion-graphic' ? t('Export transparent MOV') : t('Download original');
  const run = async () => {
    setBusy(true);
    onError('');
    try {
      await exportMediaAsset(asset, fps);
      onComplete?.();
    } catch (error) {
      onError(t('Media export failed: {message}', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} title={label} aria-label={`${label}：${asset.name}`}
      onClick={(event) => { event.stopPropagation(); void run(); }}>
      {busy ? t('Exporting…') : label}
    </button>
  );
}
