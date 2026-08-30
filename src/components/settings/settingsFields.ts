import type { IconName } from '../icons';

/** Every remaining setting is a plain choice; secrets are configured in .env.local. */
export type FieldKind = 'select';

export interface SelectOption { readonly value: string; readonly label: string; }

export interface SettingsField {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly note?: string;
  readonly options?: readonly SelectOption[];
  /** Label of the server-side default, shown as the first option ("Default (…)"). */
  readonly defaultLabel?: string;
}

/** One block inside a tab: a heading, optional note, its fields, and any custom body. */
export interface SettingsPane {
  readonly key: string;
  readonly title: string;
  readonly icon?: IconName;
  readonly note?: string;
  /** `local-models` panes render their own installer UI below the fields. */
  readonly kind?: 'local-models';
  readonly fields: readonly SettingsField[];
}

/** One tab across the top of the settings window. */
export interface SettingsTab {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly hint: string;
  readonly panes: readonly SettingsPane[];
}

export interface KeyState { configured: boolean; source: 'env' | 'runtime' | 'none'; }
export interface KeyStatusResponse {
  keys: Record<string, KeyState>;
  caps: Record<string, boolean>;
  models: Record<string, string>;
  /** Set by the save response when the change only lands on the next launch. */
  restartRequired?: boolean;
}

export const select = (
  name: string,
  label: string,
  defaultLabel: string,
  options: readonly SelectOption[],
  note?: string,
): SettingsField => ({ name, label, kind: 'select', defaultLabel, options, note });
