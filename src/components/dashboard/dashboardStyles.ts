import type { CSSProperties } from 'react';
import { theme, themeAlpha } from '../../theme';

export const newCard: CSSProperties = {
  width: '100%', aspectRatio: '16 / 9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: `0.5px dashed ${theme.border}`, borderRadius: 4, background: 'transparent', cursor: 'pointer',
};
export const card: CSSProperties = { border: `0.5px solid ${theme.border}`, borderRadius: 4, background: theme.panel, overflow: 'hidden' };
export const thumb: CSSProperties = {
  width: '100%', aspectRatio: '16 / 9', background: theme.bg, border: 'none', borderBottom: `0.5px solid ${theme.border}`,
  position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center', cursor: 'pointer',
};
export const nameInput: CSSProperties = { font: 'inherit', fontSize: 13, fontWeight: 550, background: theme.panelAlt, color: theme.text, border: `0.5px solid ${theme.accent}`, borderRadius: 5, padding: '2px 6px', width: '100%' };
export const miniBtn: CSSProperties = { background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', fontSize: 12, padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
export const settingsBtn: CSSProperties = { background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', padding: 6, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
export const importBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: theme.text,
  background: 'none', border: `0.5px solid ${theme.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
};
export const searchBox: CSSProperties = { width: 216, position: 'relative', display: 'inline-flex', alignItems: 'center' };
export const searchIcon: CSSProperties = { position: 'absolute', left: 9, display: 'inline-flex', color: theme.textDim, pointerEvents: 'none' };
export const searchInput: CSSProperties = {
  width: '100%', height: 28, boxSizing: 'border-box', padding: '0 30px 0 28px',
  border: `0.5px solid ${theme.border}`, borderRadius: 4, background: theme.bg, color: theme.text,
  fontSize: 12, WebkitAppearance: 'none',
};
export const searchClear: CSSProperties = {
  position: 'absolute', right: 2, width: 24, height: 24, display: 'grid', placeItems: 'center',
  padding: 0, border: 0, borderRadius: 4, background: 'transparent', color: theme.textDim, cursor: 'pointer',
};
export const searchEmpty: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, color: theme.textDim, fontSize: 12 };

// ── Folders ───────────────────────────────────────────────────────────────
// Folder cards are deliberately shorter than project cards: a shelf is not a
// project, and the row of them reads as a header above the grid.
export const folderRow: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))',
  alignItems: 'start', gap: 12, marginBottom: 22,
};
export const folderCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
  padding: '11px 12px', border: `0.5px solid ${theme.border}`, borderRadius: 4,
  background: theme.panel, color: theme.text,
};
export const folderOpenBtn: CSSProperties = {
  flex: 1, minWidth: 0, textAlign: 'left', padding: 0, border: 'none', background: 'none',
  color: 'inherit', font: 'inherit', fontSize: 13, fontWeight: 550, cursor: 'pointer',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
// The delete confirm has a sentence to say, so it stacks instead of trying to
// fit that sentence into the middle of a one-line card.
export const folderCardConfirm: CSSProperties = {
  ...folderCard, flexDirection: 'column', alignItems: 'stretch', gap: 8,
};
export const folderConfirmText: CSSProperties = {
  fontSize: 11.5, lineHeight: 1.45, color: theme.textDim,
};
export const folderConfirmActions: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
};
export const folderCardOver: CSSProperties = {
  ...folderCard, border: `0.5px solid ${theme.accent}`, background: theme.panelAlt,
};
export const folderCardIcon: CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', color: theme.textDim,
};
export const folderCardCount: CSSProperties = {
  flex: '0 0 auto', fontSize: 11, color: theme.textDim, fontVariantNumeric: 'tabular-nums',
};
export const folderNewCard: CSSProperties = {
  ...folderCard, border: `0.5px dashed ${theme.border}`, background: 'transparent',
  color: theme.textDim, font: 'inherit', fontSize: 12.5, cursor: 'pointer',
};
export const folderNameInput: CSSProperties = { ...nameInput, fontWeight: 500 };
export const breadcrumb: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12.5, color: theme.textDim,
};
export const breadcrumbLink: CSSProperties = {
  background: 'none', border: `0.5px solid transparent`, borderRadius: 4, padding: '3px 7px',
  color: theme.textDim, font: 'inherit', cursor: 'pointer',
};
export const breadcrumbLinkOver: CSSProperties = {
  ...breadcrumbLink, border: `0.5px solid ${theme.accent}`, color: theme.textStrong,
};
export const folderHint: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
  fontSize: 10.5, color: theme.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
export const movePicker: CSSProperties = {
  position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 20, minWidth: 176, maxWidth: 240,
  maxHeight: 232, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 1,
  border: `0.5px solid ${theme.border}`, borderRadius: 6, background: theme.panelAlt,
  boxShadow: `0 8px 24px ${themeAlpha.shadow(0.28)}`,
};
export const movePickerItem: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
  padding: '5px 8px', border: 'none', borderRadius: 4, background: 'none',
  color: theme.text, font: 'inherit', fontSize: 12, cursor: 'pointer',
};
export const movePickerItemCurrent: CSSProperties = { ...movePickerItem, color: theme.accent };
export const movePickerLabel: CSSProperties = {
  padding: '4px 8px 5px', fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: theme.textDim,
};
