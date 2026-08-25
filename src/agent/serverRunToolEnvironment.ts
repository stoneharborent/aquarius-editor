import { getLocale } from '../i18n/locale';

/** Add concrete recovery steps only for execution-environment failures. */
export function environmentFailureHint(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error);
  if (!/unavailable|not connected|app-server|cannot call|no editor|bridge|environment|execution/i.test(base)) {
    return base;
  }
  const locale = getLocale();
  const hint = locale === 'zh'
    ? ' If this is an execution-environment failure, verify the project is open, Codex is signed in (Settings → Codex), and the app service is running.'
    : locale === 'ru'
      ? ' Если это сбой среды выполнения, проверьте, что проект открыт, выполнен вход в Codex (Настройки → Codex) и служба приложения запущена.'
      : ' If this is an execution-environment failure, verify the project is open, Codex is signed in (Settings → Codex), and the app service is running.';
  return `${base}${hint}`;
}
