import type { CSSProperties } from 'react';
import { theme } from '../../theme';

export const ON = theme.success;
export const WARN = theme.danger;

export const paneCard: CSSProperties = {
  background: theme.bg, border: `0.5px solid ${theme.border}`,
  borderRadius: 6, padding: '12px 14px',
};
export const paneHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 650,
};
export const pageNote: CSSProperties = { fontSize: 11, color: theme.textDim, lineHeight: 1.55 };
export const fieldHead: CSSProperties = {
  fontSize: 11.5, color: theme.text, display: 'flex', gap: 6,
  alignItems: 'center', justifyContent: 'space-between',
};
export const select: CSSProperties = {
  font: 'inherit', fontSize: 12.5, background: theme.panelAlt, color: theme.text,
  border: `0.5px solid ${theme.border}`, borderRadius: 6,
  padding: '6px 9px', width: '100%', outline: 'none',
  cursor: 'pointer', colorScheme: 'var(--cc-color-scheme)',
};
