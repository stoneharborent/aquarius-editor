// Dashboard folders — the shelves the project cards sit on.
//
// Storage note: the folder list is its own shared-KV record ('project-folders'),
// a sibling of the project index rather than something wrapped around it. The
// project index is an array of ProjectMeta and several layers below us read it
// as exactly that (the shared-KV bootstrap inspects `projects` to decide whether
// a local store still has to be migrated to the server). Wrapping it in an object
// to make room for folders would break those readers for no gain, so the two
// records stay separate:
//
//   projects        → ProjectMeta[]  (each meta carries an optional folderId)
//   project-folders → ProjectFolder[]
//
// 'project-folders' has no colon, so it is a plain shared-store key: it needs no
// transport or protocol change, and it is never mistaken for a project-scoped
// record by the purge/ownership paths.
//
// Both records are migration-safe by construction. An index written before
// folders existed has no folderId anywhere, and absent folderId *is* the root;
// a store with no 'project-folders' record simply has no folders yet.
import { ProjectIndexCoordinator, type ProjectFolder } from './projectStoreCoordinators';
import { kvGet, kvSet } from './sharedKv';

export const PROJECT_FOLDER_INDEX_KEY = 'project-folders';

/** Longest folder name we persist; keeps one bad paste from bloating the index. */
export const MAX_FOLDER_NAME_LENGTH = 120;

export function isProjectFolder(value: unknown): value is ProjectFolder {
  if (!value || typeof value !== 'object') return false;
  const folder = value as Partial<ProjectFolder>;
  return typeof folder.id === 'string' && folder.id !== ''
    && typeof folder.name === 'string'
    && typeof folder.createdAt === 'number';
}

/** Trim, collapse whitespace and clamp; empty after that means "not a name". */
export function normalizeFolderName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME_LENGTH);
}

async function readFolderStore(): Promise<ProjectFolder[]> {
  const raw = await kvGet<unknown>(PROJECT_FOLDER_INDEX_KEY);
  return Array.isArray(raw) ? raw.filter(isProjectFolder) : [];
}

export const projectFolderCoordinator = new ProjectIndexCoordinator<ProjectFolder>(
  readFolderStore,
  (folders) => kvSet(PROJECT_FOLDER_INDEX_KEY, folders),
);

/** Folders in display order: alphabetical, oldest-first for equal names. */
export function sortFolders(folders: readonly ProjectFolder[]): ProjectFolder[] {
  return [...folders].sort((left, right) =>
    left.name.localeCompare(right.name) || left.createdAt - right.createdAt);
}
