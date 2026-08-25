import type { FormEvent, MouseEvent } from 'react';
import { useT } from '../i18n/locale';

export interface MediaPromptState {
  title: string;
  initialValue: string;
  rejectSlash?: boolean;
  onSubmit: (value: string) => void;
}

export interface MediaFolderDeleteState {
  id: string;
  name: string;
  parentId?: string;
}

export interface MediaAssetDeleteState {
  ids: string[];
  names: string[];
  usedCount: number;
}

interface MediaPoolDialogsProps {
  prompt: MediaPromptState | null;
  promptValue: string;
  folderDelete: MediaFolderDeleteState | null;
  assetDelete: MediaAssetDeleteState | null;
  assetDeleteTitle: string;
  onPromptValue: (value: string) => void;
  onSubmitPrompt: () => void;
  onClosePrompt: () => void;
  onDeleteFolder: (state: MediaFolderDeleteState) => void;
  onCloseFolderDelete: () => void;
  onDeleteAssets: (ids: string[]) => void;
  onCloseAssetDelete: () => void;
}

function PromptDialog(props: Pick<MediaPoolDialogsProps,
'prompt' | 'promptValue' | 'onPromptValue' | 'onSubmitPrompt' | 'onClosePrompt'>) {
  const t = useT();
  if (!props.prompt) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmitPrompt();
  };
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label={t(props.prompt.title)}>
    <form className="cc-modal" onSubmit={submit}>
      <strong>{t(props.prompt.title)}</strong>
      <input autoFocus aria-label={t(props.prompt.title)} value={props.promptValue} onChange={(event) => props.onPromptValue(event.target.value)} />
      <div><button type="button" onClick={props.onClosePrompt}>{t('Cancel')}</button><button type="submit" className="primary">{t('OK')}</button></div>
    </form>
  </div>;
}

function FolderDeleteDialog(props: Pick<MediaPoolDialogsProps,
'folderDelete' | 'onDeleteFolder' | 'onCloseFolderDelete'>) {
  const t = useT();
  const state = props.folderDelete;
  if (!state) return null;
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('Delete empty folder')}>
    <div className="cc-modal">
      <strong>{t('Delete empty folder "{name}"?', { name: state.name })}</strong>
      <div><button onClick={props.onCloseFolderDelete}>{t('Cancel')}</button><button className="danger" onClick={() => props.onDeleteFolder(state)}>{t('Delete')}</button></div>
    </div>
  </div>;
}

function AssetDeleteDialog(props: Pick<MediaPoolDialogsProps,
'assetDelete' | 'assetDeleteTitle' | 'onDeleteAssets' | 'onCloseAssetDelete'>) {
  const t = useT();
  const state = props.assetDelete;
  if (!state) return null;
  const stop = (event: MouseEvent) => event.stopPropagation();
  const detail = state.usedCount > 0
    ? t('Delete {count} media items and remove clips linked to {used} of them from every timeline.', { count: state.ids.length, used: state.usedCount })
    : t('Delete {count} media items from the media pool.', { count: state.ids.length });
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('Delete In-Use Media')} onClick={props.onCloseAssetDelete}>
    <div className="cc-modal" onClick={stop}>
      <strong>{props.assetDeleteTitle}</strong>
      <p className="cc-asset-delete-detail">{detail}</p>
      <p className="cc-asset-delete-detail" title={state.names.join('\n')}>{state.names.join('、')}</p>
      <div><button type="button" onClick={props.onCloseAssetDelete}>{t('Cancel')}</button><button type="button" className="danger" onClick={() => props.onDeleteAssets(state.ids)}>{t('Confirm Delete')}</button></div>
    </div>
  </div>;
}

export function MediaPoolDialogs(props: MediaPoolDialogsProps) {
  return <>
    <PromptDialog {...props} />
    <FolderDeleteDialog {...props} />
    <AssetDeleteDialog {...props} />
  </>;
}
