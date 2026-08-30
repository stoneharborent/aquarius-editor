// Runnable check: `npx tsx --tsconfig tsconfig.app.json src/components/dashboard/folder-project-cards.verify.tsx`.
//
// The folder half of the dashboard: the row of folder cards at the root, the
// breadcrumb that says which folder you are inside, the "Move to folder…"
// picker on a project card, and the selection rules behind all three
// (search reaches into every folder; browsing does not).
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProjectFolder, ProjectMeta } from '../../persist/projectStoreCoordinators';
import type { DragEvent as ReactDragEvent } from 'react';
import {
  FolderBreadcrumb,
  FolderRow,
  MoveToFolderPicker,
  PROJECT_DRAG_TYPE,
  ROOT_DROP_TARGET,
  dropProjectOnFolder,
  markProjectDropTarget,
  projectDragId,
} from './FolderViews';
import {
  countProjectsByFolder,
  selectVisibleProjects,
  type DashboardModel,
} from './useDashboardModel';

const folder = (id: string, name: string): ProjectFolder => ({ id, name, createdAt: 1 });
const project = (id: string, name: string, folderId?: string): ProjectMeta => ({
  id, name, updatedAt: 1_700_000_000_000, ...(folderId ? { folderId } : {}),
});

const clients = folder('f-clients', 'Client Work');
const shorts = folder('f-shorts', 'Short Form');
const projects = [
  project('p-1', 'Sinbad Doc', clients.id),
  project('p-2', 'Reel Cut', clients.id),
  project('p-3', 'Vertical Test', shorts.id),
  project('p-4', 'Scratch Pad'),
  project('p-5', 'Orphan Cut', 'f-deleted-elsewhere'),
];
const knownFolderIds = new Set([clients.id, shorts.id]);

// ── Selection: which projects a view shows ────────────────────────────────
assert.deepEqual(
  selectVisibleProjects(projects, '', null, knownFolderIds).map((entry) => entry.id),
  ['p-4', 'p-5'],
  'the root shows loose projects only — and a project whose folder was deleted elsewhere falls back to the root instead of vanishing',
);
assert.deepEqual(
  selectVisibleProjects(projects, '', clients.id, knownFolderIds).map((entry) => entry.id),
  ['p-1', 'p-2'],
  'opening a folder shows exactly that folder',
);
assert.deepEqual(
  selectVisibleProjects(projects, 'cut', clients.id, knownFolderIds).map((entry) => entry.id),
  ['p-2', 'p-5'],
  'search reaches into every folder, including the one you are not standing in',
);
assert.deepEqual(
  countProjectsByFolder(projects, knownFolderIds),
  { [clients.id]: 2, [shorts.id]: 1 },
  'folder counts cover only projects that are really in a live folder',
);

// ── A model stub: the folder chrome reads state, it does not own it ───────
interface Recorded {
  moved: [string, string | null] | null;
}

/** `overrides` is merged one level deep so a test can nudge a single field of
 * `folderEdit` / `move` without losing this stub's own recorders. */
function stubModel(overrides: Record<string, unknown> = {}): {
  model: DashboardModel;
  recorded: Recorded;
} {
  const recorded: Recorded = { moved: null };
  const folders = (overrides.folders as ProjectFolder[] | undefined) ?? [clients, shorts];
  const knownIds = new Set(folders.map((entry) => entry.id));
  const model = {
    folders,
    folderCounts: countProjectsByFolder(projects, knownIds),
    openFolder: null,
    setOpenFolderId: () => undefined,
    folderOf: (entry: ProjectMeta) =>
      (entry.folderId && knownIds.has(entry.folderId)
        ? folders.find((candidate) => candidate.id === entry.folderId) ?? null
        : null),
    normalizedQuery: '',
    folderEdit: {
      active: false,
      editingId: null,
      draft: '',
      confirmDeleteId: null,
      setDraft: () => undefined,
      setConfirmDeleteId: () => undefined,
      startCreate: () => undefined,
      startRename: () => undefined,
      cancel: () => undefined,
      commit: () => undefined,
      remove: () => undefined,
    },
    move: {
      projectId: null,
      open: () => undefined,
      close: () => undefined,
      moveTo: (id: string, folderId: string | null) => { recorded.moved = [id, folderId]; },
      draggingId: null,
      setDraggingId: () => undefined,
      dropTargetId: null,
      setDropTargetId: () => undefined,
    },
  } as unknown as Record<string, Record<string, unknown>>;
  for (const [key, value] of Object.entries(overrides)) {
    const nested = model[key];
    model[key] = (nested && typeof nested === 'object' && !Array.isArray(nested)
      && value && typeof value === 'object' && !Array.isArray(value))
      ? { ...nested, ...(value as Record<string, unknown>) }
      : (value as Record<string, unknown>);
  }
  return { model: model as unknown as DashboardModel, recorded };
}

// ── The folder row ────────────────────────────────────────────────────────
const row = renderToStaticMarkup(<FolderRow model={stubModel().model} />);
assert.match(row, /Client Work/, 'every folder gets a card');
assert.match(row, /Short Form/, 'every folder gets a card');
assert.match(row, /2 project\(s\)/, 'a folder card carries its project count');
assert.match(row, /1 project\(s\)/, 'a folder card carries its project count');
assert.match(row, /New Folder/, 'a new-folder affordance sits beside the existing folders');
assert.match(row, /data-folder-drop="f-clients"/, 'a folder card is a drop target for a dragged project');

const emptyRow = renderToStaticMarkup(<FolderRow model={stubModel({ folders: [] }).model} />);
assert.match(emptyRow, /New Folder/, 'with no folders yet, the only affordance is New Folder');
assert.doesNotMatch(emptyRow, /project\(s\)/, 'no folder cards are invented when there are no folders');

const creatingRow = renderToStaticMarkup(<FolderRow model={stubModel({
  folderEdit: { active: true, editingId: null },
}).model} />);
assert.match(creatingRow, /aria-label="Folder name"/, 'starting a new folder opens a named field');

// Deleting a folder must promise, in the confirm itself, that projects survive.
const confirming = renderToStaticMarkup(<FolderRow model={stubModel({
  folderEdit: { confirmDeleteId: clients.id },
}).model} />);
assert.match(confirming, /move back to All Projects/, 'the delete confirm says where the projects go');
assert.match(confirming, /nothing is deleted/, 'the delete confirm promises no project is lost');
assert.match(confirming, /Delete Folder/, 'the confirm offers the destructive action explicitly');

// ── Navigation ────────────────────────────────────────────────────────────
const inFolder = stubModel({ openFolder: clients });
const breadcrumb = renderToStaticMarkup(<FolderBreadcrumb model={inFolder.model} />);
assert.match(breadcrumb, /All Projects/, 'inside a folder there is a way back out');
assert.match(breadcrumb, /Client Work/, 'the breadcrumb names the folder being browsed');

assert.equal(
  renderToStaticMarkup(<FolderBreadcrumb model={stubModel().model} />),
  '',
  'at the root there is no breadcrumb to show',
);

assert.match(row, /title="Open folder “Client Work”"/, 'a folder card carries the control that navigates into it');

// ── Dragging a project onto a folder ──────────────────────────────────────
function dragEvent(types: string[]): { event: ReactDragEvent; prevented: boolean; effect: string } {
  const state = { prevented: false, effect: '' };
  const event = {
    dataTransfer: {
      types,
      get dropEffect() { return state.effect; },
      set dropEffect(value: string) { state.effect = value; },
    },
    preventDefault: () => { state.prevented = true; },
  } as unknown as ReactDragEvent;
  return {
    event,
    get prevented() { return state.prevented; },
    get effect() { return state.effect; },
  } as { event: ReactDragEvent; prevented: boolean; effect: string };
}

const dragging = stubModel({ move: { draggingId: 'p-4' } });
const ours = dragEvent([PROJECT_DRAG_TYPE]);
assert.equal(projectDragId(ours.event, dragging.model), 'p-4', 'a project drag is recognized by its own MIME type');
markProjectDropTarget(ours.event, dragging.model, clients.id);
assert.equal(ours.prevented, true, 'a project drag over a folder is accepted');
assert.equal(ours.effect, 'move', 'the cursor says the drag will move, not copy');
assert.equal(dropProjectOnFolder(dragEvent([PROJECT_DRAG_TYPE]).event, dragging.model, clients.id), true, 'dropping on a folder is handled');
assert.deepEqual(dragging.recorded.moved, ['p-4', clients.id], 'dropping a project card on a folder files it there');

dragging.recorded.moved = null;
assert.equal(dropProjectOnFolder(dragEvent([PROJECT_DRAG_TYPE]).event, dragging.model, null), true, 'dropping on the breadcrumb is handled');
assert.deepEqual(dragging.recorded.moved, ['p-4', null], 'dropping on “All Projects” moves the project back to the root');

// A file dragged in from the desktop must fall through to the browser.
dragging.recorded.moved = null;
const foreign = dragEvent(['Files']);
assert.equal(projectDragId(foreign.event, dragging.model), null, 'a foreign drag is not one of ours');
assert.equal(dropProjectOnFolder(foreign.event, dragging.model, clients.id), false, 'a foreign drop is left alone');
assert.equal(foreign.prevented, false, 'a foreign drop keeps its default browser behaviour');
assert.equal(dragging.recorded.moved, null, 'a foreign drop moves nothing');

const rootHighlight = stubModel({
  openFolder: clients,
  move: { draggingId: 'p-1', dropTargetId: ROOT_DROP_TARGET },
});
assert.match(
  renderToStaticMarkup(<FolderBreadcrumb model={rootHighlight.model} />),
  /All Projects/,
  'the way back out stays visible while a card is dragged over it',
);

// ── The move picker ───────────────────────────────────────────────────────
const picker = renderToStaticMarkup(
  <MoveToFolderPicker project={projects[0]!} model={stubModel().model} />,
);
assert.match(picker, /Move to folder/, 'the picker says what it does');
assert.match(picker, /No folder/, 'the root is always a destination');
assert.match(picker, /Client Work/, 'every folder is a destination');
assert.match(picker, /Short Form/, 'every folder is a destination');
assert.match(picker, /role="menu"/, 'the picker is a menu');

const emptyPicker = renderToStaticMarkup(
  <MoveToFolderPicker project={projects[3]!} model={stubModel({ folders: [] }).model} />,
);
assert.match(emptyPicker, /No folders yet/, 'with no folders the picker says so instead of looking broken');

// The picker has to say where the project is now, not just where it could go.
assert.match(picker, /data-move-target="root"/, 'the root is a real destination in the menu');
assert.match(picker, /data-move-target="f-clients"[^>]*|[^>]*data-move-target="f-clients"/, 'each folder is a destination in the menu');
assert.match(
  picker,
  /aria-checked="true"[^>]*data-move-target="f-clients"|data-move-target="f-clients"[^>]*aria-checked="true"/,
  'the folder a project is already in is the checked destination',
);
const rootProjectPicker = renderToStaticMarkup(
  <MoveToFolderPicker project={projects[3]!} model={stubModel().model} />,
);
assert.match(
  rootProjectPicker,
  /aria-checked="true"[^>]*data-move-target="root"|data-move-target="root"[^>]*aria-checked="true"/,
  'a project at the root shows "No folder" as its current destination',
);

// ── The project card wires the picker in ──────────────────────────────────
const dashboardSource = await import('node:fs/promises')
  .then((fs) => fs.readFile(new URL('./DashboardViews.tsx', import.meta.url), 'utf8'));
assert.match(dashboardSource, /MoveToFolderPicker/, 'the project card offers the move picker from its actions');
assert.match(dashboardSource, /Move to folder…/, 'the action is labelled');
assert.match(dashboardSource, /draggable/, 'a project card can be dragged onto a folder card');
assert.match(dashboardSource, /PROJECT_DRAG_TYPE, project\.id/, 'the drag carries the project id under a private MIME type');

console.log('folder-project-cards.verify: folder row, navigation, delete confirm and move picker OK');
