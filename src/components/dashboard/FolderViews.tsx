// Folder chrome for the dashboard: the row of folder cards at the root, the
// breadcrumb shown inside a folder, and the "Move to folder…" picker on a
// project card.
//
// Kept out of DashboardViews.tsx on purpose. That module pulls in the settings,
// MCP and media-cleanup dialogs, so it can only be exercised through a bundler;
// these components need nothing but the theme, the icons and a model object,
// which is what lets folder-project-cards.verify.tsx render them directly.
import { type DragEvent as ReactDragEvent } from 'react';
import type { ProjectFolder, ProjectMeta } from '../../persist/projectStoreCoordinators';
import { theme } from '../../theme';
import { useT } from '../../i18n/locale';
import { Icon } from '../icons';
import {
  breadcrumb, breadcrumbLink, breadcrumbLinkOver,
  folderCard, folderCardConfirm, folderCardCount, folderCardIcon, folderCardOver,
  folderConfirmActions, folderConfirmText,
  folderNameInput, folderNewCard, folderOpenBtn, folderRow, miniBtn,
  movePicker, movePickerItem, movePickerItemCurrent, movePickerLabel,
} from './dashboardStyles';
import type { DashboardModel } from './useDashboardModel';

// ── Folders ───────────────────────────────────────────────────────────────
// Dragging a project card is a MIME-typed drag so unrelated drop zones ignore
// it; the id is also kept on the model because dataTransfer payloads are not
// readable during dragover, and the hover highlight needs it there.
export const PROJECT_DRAG_TYPE = 'application/x-aquarius-project';

/** The drop-target id the breadcrumb uses; folders use their own id. */
export const ROOT_DROP_TARGET = 'root';

/** The dragged project, or null when the drag did not come from a project card. */
export function projectDragId(event: ReactDragEvent, model: DashboardModel): string | null {
  return event.dataTransfer.types.includes(PROJECT_DRAG_TYPE) ? model.move.draggingId : null;
}

/** Highlight a drop target while a project card is over it. `null` is the root. */
export function markProjectDropTarget(
  event: ReactDragEvent,
  model: DashboardModel,
  target: string,
): void {
  if (!projectDragId(event, model)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  model.move.setDropTargetId(target);
}

/** File the dragged project into `folderId` (null = the root). Foreign drags —
 * a file dropped from the desktop, a drag from elsewhere in the app — are left
 * alone so the browser still handles them. */
export function dropProjectOnFolder(
  event: ReactDragEvent,
  model: DashboardModel,
  folderId: string | null,
): boolean {
  const projectId = projectDragId(event, model);
  if (!projectId) return false;
  event.preventDefault();
  model.move.moveTo(projectId, folderId);
  return true;
}

export function FolderNameField({ model, placeholder }: { model: DashboardModel; placeholder: string }) {
  return <input
    autoFocus
    aria-label={placeholder}
    placeholder={placeholder}
    value={model.folderEdit.draft}
    onChange={(event) => model.folderEdit.setDraft(event.target.value)}
    onBlur={model.folderEdit.commit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') model.folderEdit.commit();
      if (event.key === 'Escape') model.folderEdit.cancel();
    }}
    style={folderNameInput}
  />;
}

export function FolderDeleteConfirm({ folder, model }: { folder: ProjectFolder; model: DashboardModel }) {
  const t = useT();
  const count = model.folderCounts[folder.id] ?? 0;
  return (
    <div style={folderCardConfirm}>
      <span style={folderConfirmText}>
        {t('Delete “{name}”? Its {n} project(s) move back to All Projects — nothing is deleted.', { name: folder.name, n: count })}
      </span>
      <div style={folderConfirmActions}>
        <button
          type="button"
          onClick={() => model.folderEdit.setConfirmDeleteId(null)}
          style={miniBtn}
        >{t('Cancel')}</button>
        <button
          type="button"
          onClick={() => model.folderEdit.remove(folder)}
          style={{ ...miniBtn, color: theme.danger }}
        >{t('Delete Folder')}</button>
      </div>
    </div>
  );
}

export function FolderCard({ folder, model }: { folder: ProjectFolder; model: DashboardModel }) {
  const t = useT();
  const over = model.move.dropTargetId === folder.id;
  if (model.folderEdit.confirmDeleteId === folder.id) {
    return <FolderDeleteConfirm folder={folder} model={model} />;
  }
  if (model.folderEdit.active && model.folderEdit.editingId === folder.id) {
    return (
      <div style={folderCard}>
        <span style={folderCardIcon}><Icon name="folder" size={15} /></span>
        <FolderNameField model={model} placeholder={t('Folder name')} />
      </div>
    );
  }
  return (
    <div
      style={over ? folderCardOver : folderCard}
      data-folder-drop={folder.id}
      onDragOver={(event) => markProjectDropTarget(event, model, folder.id)}
      onDragLeave={() => { if (over) model.move.setDropTargetId(null); }}
      onDrop={(event) => dropProjectOnFolder(event, model, folder.id)}
    >
      <span style={folderCardIcon}><Icon name="folder" size={15} /></span>
      <button
        type="button"
        onClick={() => model.setOpenFolderId(folder.id)}
        style={folderOpenBtn}
        title={t('Open folder “{name}”', { name: folder.name })}
      >{folder.name}</button>
      <span style={folderCardCount}>{t('{n} project(s)', { n: model.folderCounts[folder.id] ?? 0 })}</span>
      <div style={{ display: 'flex', gap: 2 }} className="acts">
        <button type="button" onClick={() => model.folderEdit.startRename(folder)} style={miniBtn} title={t('Rename folder')}><Icon name="pencil" size={12} /></button>
        <button type="button" onClick={() => model.folderEdit.setConfirmDeleteId(folder.id)} style={miniBtn} title={t('Delete folder')}><Icon name="trash" size={12} /></button>
      </div>
    </div>
  );
}

export function FolderRow({ model }: { model: DashboardModel }) {
  const t = useT();
  const creating = model.folderEdit.active && model.folderEdit.editingId === null;
  if (!model.folders.length && !creating) {
    return (
      <div style={folderRow}>
        <button type="button" onClick={model.folderEdit.startCreate} style={folderNewCard} title={t('New Folder')}>
          <span style={folderCardIcon}><Icon name="folderPlus" size={15} /></span>
          {t('New Folder')}
        </button>
      </div>
    );
  }
  return (
    <div style={folderRow}>
      {model.folders.map((folder) => <FolderCard key={folder.id} folder={folder} model={model} />)}
      {creating
        ? <div style={folderCard}>
          <span style={folderCardIcon}><Icon name="folderPlus" size={15} /></span>
          <FolderNameField model={model} placeholder={t('Folder name')} />
        </div>
        : <button type="button" onClick={model.folderEdit.startCreate} style={folderNewCard} title={t('New Folder')}>
          <span style={folderCardIcon}><Icon name="folderPlus" size={15} /></span>
          {t('New Folder')}
        </button>}
    </div>
  );
}

/** Inside a folder: says where you are, and takes you (or a dragged card) back out. */
export function FolderBreadcrumb({ model }: { model: DashboardModel }) {
  const t = useT();
  const folder = model.openFolder;
  if (!folder) return null;
  const over = model.move.dropTargetId === ROOT_DROP_TARGET;
  return (
    <nav style={breadcrumb} aria-label={t('Folder')}>
      <button
        type="button"
        onClick={() => model.setOpenFolderId(null)}
        style={over ? breadcrumbLinkOver : breadcrumbLink}
        title={t('Back to All Projects')}
        onDragOver={(event) => markProjectDropTarget(event, model, ROOT_DROP_TARGET)}
        onDragLeave={() => { if (over) model.move.setDropTargetId(null); }}
        onDrop={(event) => dropProjectOnFolder(event, model, null)}
      >{t('All Projects')}</button>
      <span aria-hidden="true">/</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: theme.text }}>
        <Icon name="folder" size={13} />
        {folder.name}
      </span>
    </nav>
  );
}

/** The project card's "Move to folder…" picker: every folder plus the root. */
export function MoveToFolderPicker({ project, model }: { project: ProjectMeta; model: DashboardModel }) {
  const t = useT();
  const current = model.folderOf(project);
  const choose = (folderId: string | null) => model.move.moveTo(project.id, folderId);
  return (
    <div style={movePicker} role="menu" aria-label={t('Move to folder')}>
      <div style={movePickerLabel}>{t('Move to folder')}</div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={!current}
        data-move-target="root"
        onClick={() => choose(null)}
        style={current ? movePickerItem : movePickerItemCurrent}
      >
        {current ? <span style={{ width: 12 }} /> : <Icon name="check" size={12} />}
        {t('No folder')}
      </button>
      {model.folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          role="menuitemradio"
          aria-checked={current?.id === folder.id}
          data-move-target={folder.id}
          onClick={() => choose(folder.id)}
          style={current?.id === folder.id ? movePickerItemCurrent : movePickerItem}
        >
          {current?.id === folder.id ? <Icon name="check" size={12} /> : <span style={{ width: 12 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
        </button>
      ))}
      {!model.folders.length && (
        <div style={{ ...movePickerLabel, textTransform: 'none', letterSpacing: 0 }}>{t('No folders yet')}</div>
      )}
    </div>
  );
}
