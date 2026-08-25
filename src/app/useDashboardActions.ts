import { useT } from '../i18n/locale';
import { purgeProjectCascade } from '../persist/mediaCleanup';
import {
  createProject,
  duplicateProject,
  randomProjectName,
  renameProject,
} from '../persist/projectStore';
import { buildProjectExport, importProjectPackage } from '../persist/projectTransfer';
import { emptyProjectDoc, navigateTo } from './appShell';

type Translate = (zh: string, params?: Record<string, string | number>) => string;

export interface DashboardActions {
  onOpen: (id: string) => void;
  onNew: () => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: (id: string, name: string) => Promise<string>;
  onImport: (file: File) => Promise<string>;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function exportProject(t: Translate, id: string, name: string): Promise<string> {
  const result = await buildProjectExport(id, name);
  downloadBlob(result.blob, result.filename);
  return result.mediaMissing.length
    ? t('Exported "{name}"; {n} asset(s) unavailable on both ends, not bundled', { name, n: result.mediaMissing.length })
    : t('Exported "{name}" ({n} assets included)', { name, n: result.mediaTotal });
}

async function importProject(t: Translate, file: File, refresh: () => Promise<void>): Promise<string> {
  try {
    const result = await importProjectPackage(file);
    await refresh();
    return result.mediaMissing.length
      ? t('Imported "{name}"; {n} asset(s) missing ({list})', {
        name: result.meta.name,
        n: result.mediaMissing.length,
        list: result.mediaMissing.map((source: string) => source.split('/').pop()).join('、'),
      })
      : t('Imported "{name}" (assets {a}/{b})', {
        name: result.meta.name,
        a: result.mediaRestored,
        b: result.mediaTotal,
      });
  } catch (error) {
    return t('Import failed: {error}', { error: error instanceof Error ? error.message : String(error) });
  }
}

export function useDashboardActions(refresh: () => Promise<void>): DashboardActions {
  const t = useT();
  return {
    onOpen: (id) => navigateTo(`#/editor/${id}`),
    onNew: async () => {
      const project = await createProject(randomProjectName(), emptyProjectDoc());
      await refresh();
      navigateTo(`#/editor/${project.id}`);
    },
    onRename: async (id, name) => { await renameProject(id, name); refresh(); },
    onDuplicate: async (id) => { await duplicateProject(id); refresh(); },
    onDelete: async (id) => { await purgeProjectCascade(id); refresh(); },
    onExport: (id, name) => exportProject(t, id, name),
    onImport: (file) => importProject(t, file, refresh),
  };
}
