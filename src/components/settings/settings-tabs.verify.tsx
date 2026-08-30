// The settings sections are tabs across the top of the window, not a sidebar.
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsTabBar } from './SettingsTabBar.tsx';
import { SettingsPaneView } from './SettingsPaneView.tsx';
import { SETTINGS_TABS } from './settingsSchema.ts';

const markup = renderToStaticMarkup(
  <SettingsTabBar tabs={SETTINGS_TABS} activeKey="local" onSelect={() => undefined} />,
);

assert.match(markup, /role="tablist"/, 'the sections render as a tab strip');
assert.equal((markup.match(/role="tab"/g) ?? []).length, SETTINGS_TABS.length,
  'every tab is a tab, and there are no extras');
assert.match(markup, />Interface</, 'the Interface tab is labelled');
assert.match(markup, />Local models</, 'the Local models tab is labelled');
assert.match(markup, /id="cc-settings-tab-local" aria-selected="true"/,
  'the selected tab is the one marked selected');
assert.match(markup, /id="cc-settings-tab-interface" aria-selected="false"/,
  'the other tab is not selected');

// Removed sections must not appear as tabs.
for (const label of ['Agent Model', 'Network proxy', 'AI Generation', 'Storage', 'Power Tools']) {
  assert.doesNotMatch(markup, new RegExp(label), `"${label}" was removed from settings`);
}

// The body renders the selected tab's panes; the interface pane is a plain select.
const interfaceTab = SETTINGS_TABS.find((tab) => tab.key === 'interface');
assert.ok(interfaceTab);
const body = renderToStaticMarkup(
  <>
    {interfaceTab.panes.map((pane) => (
      <SettingsPaneView key={pane.key} pane={pane}
        ctx={{ status: null, values: {}, onStage: () => undefined }} />
    ))}
  </>,
);
assert.match(body, /<select/, 'the interface tab renders its control in the body');
assert.match(body, /125%/, 'the interface scale options are rendered');
assert.doesNotMatch(body, /type="password"/, 'no secret input survives in settings');

// The tab strip is chrome, not a column: no fixed sidebar width leaks into it.
const tabBarSource = await import('./SettingsDialog.styles.ts');
assert.equal('sidebar' in tabBarSource, false, 'the three-column sidebar style is gone');
assert.equal('vendorCol' in tabBarSource, false, 'the vendor column style is gone');
assert.equal(typeof tabBarSource.tabBar, 'object', 'the tab strip has its own style');

console.log('settings-tabs.verify: top tabs replace the three-column layout');
