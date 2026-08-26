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

// Aquarius Editor has no release feed yet, so builds that cannot check for updates must show
// the version on its own instead of a button that silently does nothing.
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
const button = element.props.children[1];
button.props.onClick();
assert.equal(requested, true, 'clicking Download update must trigger the controlled update action');

console.log('settings-version.verify: current version and manual check control OK');
