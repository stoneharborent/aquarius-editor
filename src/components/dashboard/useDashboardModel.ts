import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getAgentModelSnapshot, subscribeAgentModels, type AgentModelSnapshot } from '../../agent/model-selection';
import { useT } from '../../i18n/locale';
import { listFolders, loadProject, loadProjectThumb, saveProjectThumb } from '../../persist/projectStore';
import type { ProjectFolder, ProjectMeta } from '../../persist/projectStoreCoordinators';

export interface DashboardProps {
  projects: ProjectMeta[];
  onOpen: (id: string) => void;
  onNew: (folderId?: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onExport: (id: string, name: string) => Promise<string>;
  onImport: (file: File) => Promise<string>;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveToFolder: (projectId: string, folderId: string | null) => Promise<void>;
}

export type DashboardDialog = 'settings' | 'shortcuts' | 'mcp' | 'cleanup' | 'storage';

interface RenameModel {
  editingId: string | null;
  draft: string;
  confirmId: string | null;
  setDraft: (value: string) => void;
  setConfirmId: (value: string | null) => void;
  start: (project: ProjectMeta) => void;
  commit: () => void;
  cancel: () => void;
}

interface TransferModel {
  note: string | null;
  busy: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  run: (work: Promise<string>) => Promise<void>;
  pickImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

/** Creating a folder and renaming one share a single draft: only one folder
 * name is ever being typed at a time. `editingId === null` while `active` is
 * true means the draft is a brand-new folder. */
export interface FolderEditModel {
  active: boolean;
  editingId: string | null;
  draft: string;
  confirmDeleteId: string | null;
  setDraft: (value: string) => void;
  setConfirmDeleteId: (value: string | null) => void;
  startCreate: () => void;
  startRename: (folder: ProjectFolder) => void;
  cancel: () => void;
  commit: () => void;
  remove: (folder: ProjectFolder) => void;
}

/** "Move to folder…": which card's picker is open, and where it can go. */
export interface FolderMoveModel {
  projectId: string | null;
  open: (projectId: string) => void;
  close: () => void;
  moveTo: (projectId: string, folderId: string | null) => void;
  /** The card currently being dragged, or null. */
  draggingId: string | null;
  setDraggingId: (projectId: string | null) => void;
  /** The folder card (or 'root') a dragged project is hovering over. */
  dropTargetId: string | null;
  setDropTargetId: (folderId: string | null) => void;
}

export interface DashboardModel {
  modelSnapshot: AgentModelSnapshot;
  query: string;
  normalizedQuery: string;
  visibleProjects: ProjectMeta[];
  setQuery: (value: string) => void;
  dialogs: Readonly<Record<DashboardDialog, boolean>>;
  setDialog: (dialog: DashboardDialog, open: boolean) => void;
  rename: RenameModel;
  transfer: TransferModel;
  thumbs: Readonly<Record<string, string>>;
  folders: ProjectFolder[];
  /** Active project count per folder id. */
  folderCounts: Readonly<Record<string, number>>;
  /** The folder being browsed, or null for the root. */
  openFolder: ProjectFolder | null;
  setOpenFolderId: (id: string | null) => void;
  /** The folder a project really sits in — a dangling id reads as the root. */
  folderOf: (project: ProjectMeta) => ProjectFolder | null;
  folderEdit: FolderEditModel;
  move: FolderMoveModel;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

const THUMB_RENDER_CONCURRENCY = 2;
const THUMB_RENDER_VERSION = 1;
const thumbKey = (project: ProjectMeta) => project.updatedAt + THUMB_RENDER_VERSION;

export function relativeProjectTime(ms: number, translate: Translate): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return translate('Just now');
  if (seconds < 3600) return translate('{n} min ago', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return translate('{n} hr ago', { n: Math.floor(seconds / 3600) });
  return translate('{n} d ago', { n: Math.floor(seconds / 86400) });
}

async function renderProjectPoster(project: ProjectMeta): Promise<string | null> {
  const doc = await loadProject(project.id);
  const timeline = doc?.timelines.find((entry) => entry.id === doc.activeTimelineId) ?? doc?.timelines[0];
  if (!timeline?.items?.length) return null;
  const posterItem = timeline.items.filter((item) => item.kind !== 'audio')
    .sort((left, right) => right.durationInFrames - left.durationInFrames)[0];
  if (!posterItem) return null;
  const posterFrame = posterItem.startFrame + Math.floor(posterItem.durationInFrames / 2);
  const response = await fetch('/render-still', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: timeline, frames: [posterFrame], grid: false }),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { frames?: { base64?: string }[] };
  const base64 = json.frames?.[0]?.base64;
  return base64 ? `data:image/jpeg;base64,${base64}` : null;
}

async function hydrateProjectPosters(
  projects: ProjectMeta[],
  rendering: Set<string>,
  setThumbs: Dispatch<SetStateAction<Record<string, string>>>,
  isAlive: () => boolean,
): Promise<void> {
  const active = projects.filter((project) => !project.deletedAt);
  const cached = await Promise.all(active.map(async (project) => ({ project, thumb: await loadProjectThumb(project.id) })));
  if (!isAlive()) return;
  setThumbs(Object.fromEntries(cached.filter(({ project, thumb }) => thumb?.key === thumbKey(project))
    .map(({ project, thumb }) => [project.id, thumb!.dataUrl])));
  const queue = cached.filter(({ project, thumb }) => thumb?.key !== thumbKey(project)
    && !rendering.has(`${project.id}@${thumbKey(project)}`));
  let cursor = 0;
  const worker = async () => {
    while (isAlive()) {
      const entry = queue[cursor++];
      if (!entry) return;
      const key = thumbKey(entry.project);
      const cacheKey = `${entry.project.id}@${key}`;
      rendering.add(cacheKey);
      try {
        const dataUrl = await renderProjectPoster(entry.project);
        if (!dataUrl) continue;
        await saveProjectThumb(entry.project.id, key, dataUrl);
        if (isAlive()) setThumbs((previous) => ({ ...previous, [entry.project.id]: dataUrl }));
      } catch { /* Keep old pictures or placeholders. */ } finally {
        rendering.delete(cacheKey);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(THUMB_RENDER_CONCURRENCY, queue.length) }, worker));
}

function useProjectPosters(projects: ProjectMeta[]): Readonly<Record<string, string>> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const renderingRef = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    void hydrateProjectPosters(projects, renderingRef.current, setThumbs, () => alive);
    return () => { alive = false; };
  }, [projects]);
  return thumbs;
}

function useProjectRename(onRename: DashboardProps['onRename']): RenameModel {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const start = (project: ProjectMeta) => {
    setEditingId(project.id);
    setDraft(project.name);
    setConfirmId(null);
  };
  const commit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };
  return { editingId, draft, confirmId, setDraft, setConfirmId, start, commit, cancel: () => setEditingId(null) };
}

function useProjectTransfer(onImport: DashboardProps['onImport']): TransferModel {
  const translate = useT();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = async (work: Promise<string>) => {
    setBusy(true);
    setNote(translate('Processing…'));
    try { setNote(await work); }
    catch (error) { setNote(translate('Failed: {error}', { error: error instanceof Error ? error.message : String(error) })); }
    finally { setBusy(false); }
  };
  const pickImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void run(onImport(file));
  };
  return { note, busy, fileRef, run, pickImport };
}

/** Folder rows live in their own shared-store record, so the dashboard keeps
 * its own copy and reloads it after every folder write. */
function useProjectFolders(): { folders: ProjectFolder[]; reload: () => Promise<void> } {
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const reload = useCallback(async () => { setFolders(await listFolders()); }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { folders, reload };
}

function useFolderEdit(
  props: DashboardProps,
  reload: () => Promise<void>,
  openFolderId: string | null,
  setOpenFolderId: (id: string | null) => void,
): FolderEditModel {
  const [active, setActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const cancel = () => { setActive(false); setEditingId(null); setDraft(''); };
  return {
    active,
    editingId,
    draft,
    confirmDeleteId,
    setDraft,
    setConfirmDeleteId,
    startCreate: () => { setActive(true); setEditingId(null); setDraft(''); setConfirmDeleteId(null); },
    startRename: (folder) => { setActive(true); setEditingId(folder.id); setDraft(folder.name); setConfirmDeleteId(null); },
    cancel,
    commit: () => {
      const name = draft.trim();
      const id = editingId;
      cancel();
      if (!name) return;
      void (id ? props.onRenameFolder(id, name) : props.onCreateFolder(name)).then(reload);
    },
    remove: (folder) => {
      setConfirmDeleteId(null);
      // Browsing the folder that just went away would strand the view on an
      // empty shelf, so step back to the root first.
      if (openFolderId === folder.id) setOpenFolderId(null);
      void props.onDeleteFolder(folder.id).then(reload);
    },
  };
}

function useFolderMove(props: DashboardProps): FolderMoveModel {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // An open picker closes on the next click anywhere, or on Escape. The
  // listener is armed a tick late so the very click that opened it — which is
  // still propagating towards document when this effect runs — cannot close it.
  useEffect(() => {
    if (!projectId) return;
    const close = () => setProjectId(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const armed = setTimeout(() => document.addEventListener('click', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(armed);
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [projectId]);
  return {
    projectId,
    open: setProjectId,
    close: () => setProjectId(null),
    moveTo: (id, folderId) => {
      setProjectId(null);
      setDraggingId(null);
      setDropTargetId(null);
      void props.onMoveToFolder(id, folderId);
    },
    draggingId,
    setDraggingId,
    dropTargetId,
    setDropTargetId,
  };
}

function useDashboardDialogs() {
  const [dialogs, setDialogs] = useState<Record<DashboardDialog, boolean>>({ settings: false, shortcuts: false, mcp: false, cleanup: false, storage: false });
  const setDialog = (dialog: DashboardDialog, open: boolean) => {
    setDialogs((current) => ({ ...current, [dialog]: open }));
  };
  return { dialogs, setDialog };
}

/** Search reaches into every folder — a project you cannot remember filing is
 * exactly the one you search for — so only the unsearched view is scoped to
 * the folder being browsed. */
export function selectVisibleProjects(
  projects: readonly ProjectMeta[],
  normalizedQuery: string,
  openFolderId: string | null,
  knownFolderIds: ReadonlySet<string>,
): ProjectMeta[] {
  if (normalizedQuery) {
    return projects.filter((project) => project.name.toLocaleLowerCase().includes(normalizedQuery));
  }
  return projects.filter((project) => resolvedFolderId(project, knownFolderIds) === openFolderId);
}

/** A folderId pointing at a folder this store no longer has (deleted from
 * another window) must not hide the project: it reads as the root. */
function resolvedFolderId(project: ProjectMeta, knownFolderIds: ReadonlySet<string>): string | null {
  return project.folderId && knownFolderIds.has(project.folderId) ? project.folderId : null;
}

export function countProjectsByFolder(
  projects: readonly ProjectMeta[],
  knownFolderIds: ReadonlySet<string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of knownFolderIds) counts[id] = 0;
  for (const project of projects) {
    const id = resolvedFolderId(project, knownFolderIds);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function useDashboardModel(props: DashboardProps): DashboardModel {
  const modelSnapshot = useSyncExternalStore(subscribeAgentModels, getAgentModelSnapshot);
  const [query, setQuery] = useState('');
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const { folders, reload: reloadFolders } = useProjectFolders();
  const knownFolderIds = new Set(folders.map((folder) => folder.id));
  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
  // A folder deleted in another window leaves the view pointing at nothing.
  const effectiveFolderId = openFolder?.id ?? null;
  const visibleProjects = selectVisibleProjects(
    props.projects, normalizedQuery, effectiveFolderId, knownFolderIds,
  );
  const { dialogs, setDialog } = useDashboardDialogs();
  const rename = useProjectRename(props.onRename);
  const transfer = useProjectTransfer(props.onImport);
  const thumbs = useProjectPosters(props.projects);
  const folderEdit = useFolderEdit(props, reloadFolders, effectiveFolderId, setOpenFolderId);
  const move = useFolderMove(props);
  return {
    modelSnapshot,
    query,
    normalizedQuery,
    visibleProjects,
    setQuery,
    dialogs,
    setDialog,
    rename,
    transfer,
    thumbs,
    folders,
    folderCounts: countProjectsByFolder(props.projects, knownFolderIds),
    openFolder,
    setOpenFolderId,
    folderOf: (project) => {
      const id = resolvedFolderId(project, knownFolderIds);
      return id ? folders.find((folder) => folder.id === id) ?? null : null;
    },
    folderEdit,
    move,
  };
}
