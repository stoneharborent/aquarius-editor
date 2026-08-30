// Tabs across the top of the settings window. Replaces the old three-column
// tree/vendor/pane layout: with two sections left, a sidebar was mostly empty
// chrome, and a tab strip puts both of them one click away.
import { useT } from '../../i18n/locale';
import { Icon } from '../icons';
import type { SettingsTab } from './settingsSchema';
import { tabBar, tabButton } from './SettingsDialog.styles';

export function SettingsTabBar({ tabs, activeKey, onSelect }: {
  tabs: readonly SettingsTab[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  return (
    <div role="tablist" aria-label={t('Settings sections')} style={tabBar}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`cc-settings-tab-${tab.key}`}
            aria-selected={active}
            onClick={() => onSelect(tab.key)}
            style={tabButton(active)}
          >
            <Icon name={tab.icon} size={13} />
            <span>{t(tab.title)}</span>
          </button>
        );
      })}
    </div>
  );
}
