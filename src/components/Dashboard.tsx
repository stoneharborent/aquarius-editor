import { theme } from '../theme';
import { UpstreamUpdateNotice } from '../ui/UpstreamUpdateNotice';
import { DesktopWindowControls } from './DesktopWindowControls';
import {
  DashboardContent,
  DashboardDialogs,
  DashboardTitlebarContent,
} from './dashboard/DashboardViews';
import { useDashboardModel, type DashboardProps } from './dashboard/useDashboardModel';
import { useDesktopWindowChrome } from '../hooks/useDesktopWindowChrome';

/** Dashboard titlebar height in CSS px (it runs taller than the editor's top bar). */
const DASHBOARD_HEADER_HEIGHT = 48;

export function Dashboard(props: DashboardProps) {
  const model = useDashboardModel(props);
  // Same header-is-the-titlebar contract as the editor's TopBar.
  const chrome = useDesktopWindowChrome(DASHBOARD_HEADER_HEIGHT);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: theme.bg, color: theme.text, fontFamily: 'Geist, system-ui, -apple-system, sans-serif' }}>
      <UpstreamUpdateNotice />
      <header className={chrome.className} onDoubleClick={chrome.onDoubleClick} style={{ position: 'relative', height: DASHBOARD_HEADER_HEIGHT, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', borderBottom: `0.5px solid ${theme.border}`, background: theme.panel }}>
        <DesktopWindowControls placement="leading" platform={chrome.platform} maximized={chrome.maximized} fullScreen={chrome.fullScreen} />
        <DashboardTitlebarContent model={model} />
        <DesktopWindowControls placement="trailing" platform={chrome.platform} maximized={chrome.maximized} fullScreen={chrome.fullScreen} />
      </header>
      <DashboardContent props={props} model={model} />
      <DashboardDialogs model={model} />
    </div>
  );
}
