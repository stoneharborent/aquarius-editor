import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopWindowControlButtons } from '../components/DesktopWindowControls';

const moduleUrl = new URL('./UpstreamUpdateNoticeView.tsx', import.meta.url);
const noticeModule = await import(moduleUrl.href).catch(() => null);

assert.ok(noticeModule, 'the app must provide a non-blocking upstream version notice');

const { UpstreamUpdateNoticeView } = noticeModule;
const markup = renderToStaticMarkup(
  <div data-dashboard-chrome>
    <UpstreamUpdateNoticeView
      message="A new version of Aquarius Editor is available: V0.2.0 (you're on V0.1.9). You can download and install it now."
      actionLabel="Download update"
      closeLabel="Close"
      onAction={() => undefined}
      onDismiss={() => undefined}
    />
    <DesktopWindowControlButtons
      translate={(text) => text}
      maximized={false}
      onAction={() => undefined}
    />
  </div>,
);

assert.match(markup, /A new version of Aquarius Editor is available: V0\.2\.0/, 'the update notice must clearly state the official product and version');
assert.match(markup, />Download update<\/button>/, 'the desktop update notice must offer a direct download action');
assert.match(markup, /role="status"/, 'a non-blocking notice should use status semantics');
assert.doesNotMatch(markup, /<a\b/, 'the update action must go through controlled desktop IPC, not an arbitrary link');
assert.match(markup, /top:50%/, 'the update notice should be vertically centered on the home page');
assert.match(markup, /left:50%/, 'the update notice should be horizontally centered on the home page');
assert.match(markup, /z-index:190/, 'the update notice must sit below the settings dialog so it never blocks settings actions');
assert.match(markup, /transform:translate\(-50%,\s*-50%\)/, 'the update notice should align its own center with the window center');
assert.match(markup, /aria-label="Window controls"/, 'desktop window controls must be renderable in the same dashboard chrome as the home-page update notice');
assert.equal((markup.match(/class="cc-window-control /g) ?? []).length, 3, 'the app-drawn title bar keeps all three window control buttons');


console.log('upstream-update-notice.verify: dashboard-only centered upstream update notice OK');
