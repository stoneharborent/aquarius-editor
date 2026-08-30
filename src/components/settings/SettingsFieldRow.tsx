// Field rendering for the settings window. Everything left in settings is a
// non-secret choice, so there is exactly one control: a select whose first
// option ("Default (…)") clears the saved value and returns to the default.
import { useT } from '../../i18n/locale';
import { theme } from '../../theme';
import {
  modelValue,
  selectOptions,
  type KeyStatusResponse,
  type SettingsField,
  type StagedValues as Values,
} from './settingsSchema';
import { fieldHead, select as selectStyle } from './settingsPane.styles';

/** Shared context for field rendering: server status + staged edits. */
export interface FieldCtx {
  status: KeyStatusResponse | null;
  values: Values;
  onStage: (field: SettingsField, raw: string) => void;
}

export function FieldRow({ field, ctx }: { field: SettingsField; ctx: FieldCtx }) {
  const t = useT();
  // undefined = untouched (echo the server value); '' = staged "back to default".
  const shown = ctx.values[field.name] ?? modelValue(ctx.status, field.name);
  const options = selectOptions(field);
  // A value set by hand in .env.local that is not in the option list is still
  // shown faithfully rather than silently snapping to the default.
  const unknown = shown !== '' && !options.some((option) => option.value === shown);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={fieldHead}>{t(field.label)}</span>
      <select
        value={shown}
        onChange={(event) => ctx.onStage(field, event.target.value)}
        style={selectStyle}
      >
        {unknown && <option value={shown}>{shown}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{t(option.label)}</option>
        ))}
      </select>
      {field.note && <span style={{ fontSize: 10.5, color: theme.textDim }}>{t(field.note)}</span>}
    </label>
  );
}
