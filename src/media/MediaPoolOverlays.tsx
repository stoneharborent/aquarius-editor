import { createPortal } from 'react-dom';
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { MediaAsset, MediaFolder } from '../editor/types';
import { useT } from '../i18n/locale';
import { theme } from '../theme';
import { AssetExportButton } from './AssetExportButton';
import { folderPath } from './mediaPoolFormat';
import { AssetMenuDestinations } from './AssetMenuDestinations';
import type { MediaSortKey, MediaTypeFilter } from './mediaPoolFilter';

interface AssetMenuPortalProps {
  asset?: MediaAsset;
  position: CSSProperties | null;
  fps: number;
  folders: MediaFolder[];
  missing: boolean;
  confirmDelete: boolean;
  canRelink: boolean;
  canRemove: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onFavorite: () => void;
  onRename: () => void;
  onRelink: () => void;
  onRemove: () => void;
  onMove: (folderId?: string) => void;
  onAddTimeline?: () => void;
  onAddChat: () => void;
  /** Transcribe the menu's asset selection (enabled when any is transcribable). */
  onTranscribe?: () => void;
  /** Open the transcript viewer for the menu's anchor asset. */
  onViewTranscript?: () => void;
}

interface BlankMediaMenuActionsProps {
  clipboardCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  view: 'grid' | 'list';
  sort: MediaSortKey;
  type: MediaTypeFilter;
  onPaste: () => void;
  onSelectAll: () => void;
  onUpload: () => void;
  onSemanticSearch: () => void;
  onMobileUpload: () => void;
  onCreateFolder: () => void;
  onViewToggle: () => void;
  onSort: (value: MediaSortKey) => void;
  onType: (value: MediaTypeFilter) => void;
}

export function BlankMediaMenuActions(props: BlankMediaMenuActionsProps) {
  const t = useT();
  return <>
    <button type="button" disabled={!props.clipboardCount} onClick={props.onPaste}>{t('Paste copies')}{props.clipboardCount > 1 ? ` (${props.clipboardCount})` : ''}</button>
    <button type="button" disabled={!props.visibleCount} onClick={props.onSelectAll}>{t(props.allVisibleSelected ? 'Deselect all' : 'Select all')}</button>
    <hr />
    <button type="button" onClick={props.onSemanticSearch}>{t('Local semantic search')}</button>
    <button type="button" onClick={props.onMobileUpload}>{t('Upload from phone')}</button>
    <button type="button" onClick={props.onUpload}>{t('Upload media')}</button>
    <button type="button" onClick={props.onCreateFolder}>{t('New folder')}</button>
    <button type="button" onClick={props.onViewToggle}>{t(props.view === 'grid' ? 'Switch to list view' : 'Switch to grid view')}</button>
    <label><span>{t('Sort')}</span><select aria-label={t('Sort media')} value={props.sort} onChange={(event) => props.onSort(event.target.value as MediaSortKey)}>
      <option value="newest">{t('Newest first')}</option><option value="name">{t('Name A–Z')}</option><option value="duration">{t('Duration')}</option>
    </select></label>
    <label><span>{t('Filter')}</span><select aria-label={t('Filter media')} value={props.type} onChange={(event) => props.onType(event.target.value as MediaTypeFilter)}>
      <option value="all">{t('All')}</option><option value="video">{t('Video')}</option><option value="image">{t('Image')}</option><option value="audio">{t('Audio')}</option><option value="document">{t('Document')}</option><option value="file">{t('Other files')}</option>
    </select></label>
  </>;
}

export function BlankMediaMenuPortal(props: BlankMediaMenuActionsProps & { position: { top: number; left: number }; onClose: () => void }) {
  const { onClose } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useT();
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [onClose]);
  return createPortal(
    <div ref={menuRef} className="cc-media-popover cc-media-blank-menu" style={props.position} role="menu" aria-label={t('Media pool background menu')} onClick={(event) => event.stopPropagation()}>
      <BlankMediaMenuActions {...props} />
    </div>,
    document.body,
  );
}

function usePopoverDismiss(
  active: boolean,
  onClose: () => void,
  menuRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    menuRef.current?.querySelector<HTMLElement>('button:not(:disabled), select')?.focus();
  }, [active, menuRef]);
  useEffect(() => {
    if (!active) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [active, menuRef, onClose]);
}

export function AssetMenuPortal(props: AssetMenuPortalProps) {
  const { asset, onClose, position } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useT();
  usePopoverDismiss(!!asset && !!position, onClose, menuRef);
  if (!props.asset || !props.position) return null;
  return createPortal(
      <div
        ref={menuRef}
        className="cc-media-popover cc-asset-menu-portal"
        style={props.position}
        role="menu"
        aria-label={t('Manage {name}', { name: props.asset.name })}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) props.onClose();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <AssetMenuActions {...props} asset={props.asset} />
      </div>,
    document.body,
  );
}

interface FolderMenuPortalProps {
  folder?: MediaFolder;
  position: CSSProperties | null;
  /** Empty folders only — delete is disabled when the folder still has children. */
  canDelete: boolean;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function FolderMenuPortal(props: FolderMenuPortalProps) {
  const { folder, onClose, position } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useT();
  usePopoverDismiss(!!folder && !!position, onClose, menuRef);
  if (!folder || !position) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="cc-media-popover cc-asset-menu-portal"
      style={position}
      role="menu"
      aria-label={t('Manage folder {name}', { name: folder.name })}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={props.onOpen}>{t('Open')}</button>
      <button type="button" onClick={props.onRename}>{t('Rename')}</button>
      <button
        type="button"
        className="danger"
        disabled={!props.canDelete}
        title={props.canDelete ? undefined : t('Only empty folders can be deleted; move or delete their contents first')}
        onClick={props.onDelete}
      >
        {t('Delete')}
      </button>
    </div>,
    document.body,
  );
}

function AssetMenuActions(props: AssetMenuPortalProps & { asset: MediaAsset }) {
  const { asset } = props;
  const t = useT();
  return (
    <>
      {!props.missing && <AssetExportButton asset={asset} fps={props.fps} onError={props.onError} onComplete={props.onClose} />}
      {props.onTranscribe && <button type="button" onClick={props.onTranscribe}>{asset.transcribeStatus === 'failed' ? t('Retranscribe') : t('Transcription')}</button>}
      {props.onViewTranscript && <button type="button" onClick={props.onViewTranscript}>{t('View transcript')}</button>}
      <button type="button" onClick={props.onFavorite}>{asset.favorite ? t('Unfavorite') : t('Favorite')}</button>
      <button type="button" onClick={props.onRename}>{t('Rename')}</button>
      {props.canRelink && asset.kind !== 'motion-graphic' && <button type="button" onClick={props.onRelink}>{t('Relink file')}</button>}
      {props.canRemove && <button type="button" className="danger" onClick={props.onRemove}>{props.confirmDelete ? t('Confirm Delete') : t('Delete')}</button>}
      <label className="cc-asset-menu-move">
        <span>{t('Move to')}</span>
        <select aria-label={t('Move {name}', { name: asset.name })} value={asset.folderId ?? ''} onChange={(event) => props.onMove(event.target.value || undefined)}>
          <option value="">Master</option>
          {props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder, props.folders)}</option>)}
        </select>
      </label>
      <AssetMenuDestinations assetName={asset.name} onAddTimeline={props.onAddTimeline} onAddChat={props.onAddChat} />
    </>
  );
}

export function MissingMediaBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  const t = useT();
  if (count === 0) return null;
  return (
    <div className="cc-media-missing-banner" style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      margin: '0 10px 8px', padding: '8px 10px', borderRadius: 4,
      background: theme.panelAlt, border: `0.5px solid ${theme.border}`,
      borderLeft: `2px solid ${theme.accent}`, fontSize: 12, color: theme.textMuted,
    }}>
      <span style={{ flex: 1, minWidth: 140 }}>
        {t('{n} assets are missing or failed to load. Pick a folder to search, or relink from each row.', { n: count })}
      </span>
      <button type="button" onClick={onOpen} style={{
        background: theme.hover, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 3,
        padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        {t('Relink Offline Media')}
      </button>
    </div>
  );
}

interface RelinkAllDialogProps {
  open: boolean;
  busy: boolean;
  message: string | null;
  missingAssets: MediaAsset[];
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onPickFolder: (files: FileList | null) => void;
  onRelink: (id: string) => void;
}

export function RelinkAllDialog(props: RelinkAllDialogProps) {
  const t = useT();
  if (!props.open) return null;
  return (
    <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('Relink Offline Media')} onClick={props.onClose}>
      <div className="cc-modal" style={{ width: 'min(420px, 92vw)', maxHeight: '70vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <strong>{t('Relink Offline Media')}</strong>
        <p style={{ margin: '8px 0 12px', fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>{t('Files in this project were moved or renamed. Pick a folder to batch-relink by filename, or relink each asset below.')}</p>
        <input
          ref={(node) => {
            props.inputRef.current = node;
            // React does not understand webkitdirectory; without it the button
            // opens a plain file picker and folder relink can never work.
            node?.setAttribute('webkitdirectory', '');
            node?.setAttribute('directory', '');
          }}
          type="file" multiple hidden onChange={(event) => props.onPickFolder(event.target.files)}
        />
        <button type="button" className="primary" disabled={props.busy} onClick={() => props.inputRef.current?.click()} style={{ width: '100%', marginBottom: 10 }}>
          {props.busy ? t('Matching by filename…') : t('Pick a folder to batch relink (match by filename)')}
        </button>
        {props.message && <div style={{ fontSize: 12, color: `color-mix(in srgb, ${theme.success} 65%, ${theme.textStrong})`, margin: '0 0 10px' }}>{props.message}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {props.missingAssets.map((asset) => <RelinkRow key={asset.id} asset={asset} onRelink={props.onRelink} />)}
          {props.missingAssets.length === 0 && <div style={{ fontSize: 12, color: theme.textDim }}>{t('Nothing left to relink')}</div>}
        </div>
        <div style={{ marginTop: 12 }}><button type="button" onClick={props.onClose}>{t('Close')}</button></div>
      </div>
    </div>
  );
}

function RelinkRow({ asset, onRelink }: { asset: MediaAsset; onRelink: (id: string) => void }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 4, background: theme.panelAlt }}>
      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</span>
      <button type="button" className="primary" onClick={() => onRelink(asset.id)} style={{ flexShrink: 0 }}>{t('Relink file')}</button>
    </div>
  );
}
