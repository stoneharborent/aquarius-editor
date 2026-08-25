import { useT } from '../i18n/locale';
import {
  MAX_VIDEO_BITRATE_MBPS,
  MIN_VIDEO_BITRATE_MBPS,
  type VideoBitrateMode,
} from './bitrate';

interface ExportBitrateControlProps {
  mode: VideoBitrateMode;
  customMbps: number;
  resolvedBps: number;
  disabled: boolean;
  onModeChange: (mode: VideoBitrateMode) => void;
  onCustomMbpsChange: (value: number) => void;
}

const MODES: Array<{ value: VideoBitrateMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'compact', label: 'Smaller file' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'high', label: 'High quality' },
  { value: 'custom', label: 'Custom' },
];

export function ExportBitrateControl({
  mode,
  customMbps,
  resolvedBps,
  disabled,
  onModeChange,
  onCustomMbpsChange,
}: ExportBitrateControlProps) {
  const t = useT();
  return (
    <div className="cc-export-bitrate">
      <select
        className="cc-export-select"
        aria-label={t('Bitrate mode')}
        value={mode}
        disabled={disabled}
        onChange={(event) => onModeChange(event.target.value as VideoBitrateMode)}
      >
        {MODES.map((entry) => <option key={entry.value} value={entry.value}>{t(entry.label)}</option>)}
      </select>
      {mode === 'custom' && (
        <label className="cc-export-bitrate-custom">
          <input
            type="number"
            min={MIN_VIDEO_BITRATE_MBPS}
            max={MAX_VIDEO_BITRATE_MBPS}
            step={0.5}
            value={customMbps}
            disabled={disabled}
            aria-label={t('Custom bitrate')}
            onChange={(event) => onCustomMbpsChange(Number(event.target.value))}
          />
          <span>Mbps</span>
        </label>
      )}
      <small>{t('Estimated video bitrate: {value} Mbps', { value: (resolvedBps / 1_000_000).toFixed(1) })}</small>
    </div>
  );
}
