// What sits at each end of the app-drawn titlebar, per platform.
//
//   leading   macOS only — an empty lane the width of the real traffic lights,
//             which the OS draws on top of our bar (desktop/window-frame.ts keeps
//             them centred). Full screen takes them away, so the lane goes too.
//   trailing  Linux — the app's own minimize / maximize / close, painted in skin
//             tokens so the controls are the same surface as the rest of the bar.
//             Windows — an empty lane the width of the Window Controls Overlay,
//             which the system paints in the skin's colours (that is what keeps
//             Snap Layouts working on the maximize button).
//
// In a browser there is no desktop bridge and both slots render nothing.
import { useT } from '../i18n/locale';
import type { DesktopChromePlatform } from '../hooks/useDesktopWindowChrome';

export type DesktopWindowAction = 'close' | 'minimize' | 'toggle-maximize';

interface DesktopWindowControlButtonsProps {
  translate: (text: string) => string;
  maximized: boolean;
  onAction: (action: DesktopWindowAction) => void;
}

const GLYPH = { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, 'aria-hidden': true } as const;

/** Linux control cluster. Order is the GNOME/Windows one: minimize, maximize, close. */
export function DesktopWindowControlButtons({
  translate,
  maximized,
  onAction,
}: DesktopWindowControlButtonsProps) {
  const maximizeLabel = maximized ? translate('Restore window') : translate('Maximize window');
  return (
    <div className="cc-window-controls" role="group" aria-label={translate('Window controls')}>
      <button
        type="button"
        className="cc-window-control cc-tip"
        aria-label={translate('Minimize window')}
        data-tip={translate('Minimize window')}
        onClick={() => onAction('minimize')}
      >
        <svg {...GLYPH}><path d="M1 5h8" strokeLinecap="round" /></svg>
      </button>
      <button
        type="button"
        className="cc-window-control cc-tip"
        aria-label={maximizeLabel}
        aria-pressed={maximized}
        data-tip={maximizeLabel}
        onClick={() => onAction('toggle-maximize')}
      >
        {maximized ? (
          <svg {...GLYPH}>
            <rect x="1" y="3" width="6" height="6" rx="1" />
            <path d="M3 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H7" />
          </svg>
        ) : (
          <svg {...GLYPH}><rect x="1.5" y="1.5" width="7" height="7" rx="1" /></svg>
        )}
      </button>
      <button
        type="button"
        className="cc-window-control cc-window-control--close cc-tip cc-tip-r"
        aria-label={translate('Close window')}
        data-tip={translate('Close window')}
        onClick={() => onAction('close')}
      >
        <svg {...GLYPH}><path d="M2 2l6 6M8 2l-6 6" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

interface DesktopWindowControlsProps {
  placement: 'leading' | 'trailing';
  platform: DesktopChromePlatform;
  maximized: boolean;
  fullScreen: boolean;
}

export function DesktopWindowControls({
  placement,
  platform,
  maximized,
  fullScreen,
}: DesktopWindowControlsProps) {
  const t = useT();
  if (placement === 'leading') {
    // macOS: reserve the traffic-light lane. In full screen the OS hides them.
    if (platform !== 'mac' || fullScreen) return null;
    return <span className="cc-window-inset cc-window-inset--mac" aria-hidden="true" />;
  }
  if (platform === 'windows') {
    return <span className="cc-window-inset cc-window-inset--win" aria-hidden="true" />;
  }
  if (platform !== 'linux') return null;
  return (
    <DesktopWindowControlButtons
      translate={t}
      maximized={maximized}
      onAction={(action) => { void window.openChatCutDesktop?.windowAction(action); }}
    />
  );
}
