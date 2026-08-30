import type { CSSProperties } from 'react';
import { theme, themeAlpha } from '../../theme';

export const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: themeAlpha.shadow(0.62), display: 'grid', placeItems: 'center',
  zIndex: 200, padding: 24, fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
};
export const panel: CSSProperties = {
  width: 'min(820px, 100%)', height: 'min(640px, 86vh)', display: 'flex', flexDirection: 'column',
  background: theme.panel, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 6,
  boxShadow: `0 24px 64px ${themeAlpha.shadow(0.5)}`, overflow: 'hidden',
};
export const head: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '13px 16px 13px 20px', borderBottom: `0.5px solid ${theme.border}`,
};
export const tabBar: CSSProperties = {
  display: 'flex', alignItems: 'stretch', gap: 4, flex: '0 0 auto',
  padding: '0 14px', borderBottom: `0.5px solid ${theme.border}`, background: theme.panel,
};

/** Underlined tab: the active one carries the accent rule and full-strength text. */
export function tabButton(active: boolean): CSSProperties {
  return {
    font: 'inherit', fontSize: 12.5, fontWeight: active ? 650 : 500,
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '10px 12px', border: 'none', background: 'transparent',
    borderBottom: `2px solid ${active ? theme.accent : 'transparent'}`,
    color: active ? theme.text : theme.textDim,
    cursor: 'pointer', marginBottom: -1,
  };
}
export const bodyColumn: CSSProperties = {
  flex: 1, minHeight: 0, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 20px 18px',
};
export const tabHint: CSSProperties = {
  margin: 0, fontSize: 11.5, lineHeight: 1.6, color: theme.textDim,
};
export const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 12px 20px',
  borderTop: `0.5px solid ${theme.border}`, background: theme.panel,
};
export const footMsg: CSSProperties = {
  flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11.5,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
export const licenseLink: CSSProperties = {
  color: theme.textDim, fontSize: 11.5, textDecoration: 'underline', textUnderlineOffset: 2,
};
export const iconBtn: CSSProperties = {
  background: 'none', border: 'none', color: theme.textDim,
  cursor: 'pointer', padding: 4, borderRadius: 5, display: 'inline-flex',
};
export const btnGhost: CSSProperties = {
  font: 'inherit', fontSize: 12.5, background: 'transparent', color: theme.text,
  border: `0.5px solid ${theme.border}`, borderRadius: 4, padding: '6px 13px', cursor: 'pointer',
};
export const btnPrimary: CSSProperties = {
  font: 'inherit', fontSize: 12.5, fontWeight: 600, background: theme.accent,
  color: theme.onAccent, border: 'none', borderRadius: 4, padding: '6px 16px',
};
export const code: CSSProperties = {
  fontFamily: 'ui-monospace, monospace', fontSize: 10,
  background: theme.panelAlt, padding: '1px 4px', borderRadius: 4,
};
