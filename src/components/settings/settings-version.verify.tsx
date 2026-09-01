import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

const moduleUrl = new URL('./SettingsVersionControl.tsx', import.meta.url);
const versionModule = await import(moduleUrl.href).catch(() => null);

assert.ok(versionModule, 'the settings header should provide its own version + check-for-updates control');

const { SettingsVersionControl } = versionModule;
let requested = false;
const markup = renderToStaticMarkup(
  <SettingsVersionControl
    versionLabel="Current version: V0.1.9"
    actionLabel="Download update"
    disabled={false}
    onAction={() => { requested = true; }}
  />,
);

assert.match(markup, /Current version: V0\.1\.9/, 'the settings header must display the version from package.json');
assert.match(markup, />Download update<\/button>/, 'once a new desktop version is found, a direct download entry point must be offered');
assert.doesNotMatch(markup, /automatic update/i, 'the download must keep user confirmation and must never become a silent automatic update');

// Builds that cannot check for updates must show the version on its own instead of a button
// that silently does nothing.
const withoutUpdates = renderToStaticMarkup(
  <SettingsVersionControl
    versionLabel="Current version: V0.1.9"
    actionLabel={undefined}
    disabled={false}
    onAction={() => { requested = true; }}
  />,
);
assert.match(withoutUpdates, /Current version: V0\.1\.9/, 'the version is always shown');
assert.doesNotMatch(withoutUpdates, /<button/, 'no update control may be offered without a release feed');

const element = SettingsVersionControl({
  versionLabel: 'Current version: V0.1.9',
  actionLabel: 'Download update',
  disabled: false,
  onAction: () => { requested = true; },
});
const buttons = element.props.children.filter((child: unknown) => child !== null);
const button = buttons.at(-1);
button.props.onClick();
assert.equal(requested, true, 'clicking Download update must trigger the controlled update action');
assert.equal(
  buttons.length,
  2,
  'with no failure to escape, the header shows the version and one update control',
);

// When the updater itself fails, the header must offer a way out that does not depend on it.
// v0.6.0 on AquariusOS could not check for updates at all and offered only "Check again",
// which failed identically every time — nothing pointed at the release that fixed it.
let openedReleases = false;
const stranded = renderToStaticMarkup(
  <SettingsVersionControl
    versionLabel="Current version: V0.6.0"
    actionLabel="Check again"
    disabled={false}
    fallbackLabel="Open releases page"
    onAction={() => undefined}
    onFallback={() => { openedReleases = true; }}
  />,
);
assert.match(stranded, />Check again<\/button>/, 'a failed check stays retryable');
assert.match(stranded, />Open releases page<\/button>/, 'a failed check must never be a dead end');

const strandedElement = SettingsVersionControl({
  versionLabel: 'Current version: V0.6.0',
  actionLabel: 'Check again',
  disabled: false,
  fallbackLabel: 'Open releases page',
  onAction: () => undefined,
  onFallback: () => { openedReleases = true; },
});
strandedElement.props.children.filter((child: unknown) => child !== null)[1].props.onClick();
assert.equal(openedReleases, true, 'the escape hatch must run the releases-page command');

console.log('settings-version.verify: current version, manual check control, and failure escape hatch OK');
