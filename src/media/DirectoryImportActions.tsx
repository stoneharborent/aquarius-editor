import { Icon } from '../components/icons';
import { useT } from '../i18n/locale';

interface DirectoryImportActionsProps {
  onPickFolder?: () => void;
  onWatchFolder?: () => void;
  onStopWatch: () => void;
  watchingFolder: string | null;
  watchBusy: boolean;
  run: (action: () => void) => void;
}

export function DirectoryImportActions(props: DirectoryImportActionsProps) {
  const t = useT();
  const pickFolder = props.onPickFolder;
  const watchFolder = props.onWatchFolder;
  return <>
    {pickFolder && <button onClick={() => props.run(pickFolder)}>
      <Icon name="folderPlus" size={16} />{t('Import folder…')}
    </button>}
    {watchFolder && (props.watchingFolder
      ? <button onClick={() => props.run(props.onStopWatch)}>
        <Icon name="x" size={15} />{props.watchBusy
          ? t('Stop preparing watch folder “{dir}”', { dir: props.watchingFolder })
          : t('Stop watching “{dir}”', { dir: props.watchingFolder })}
      </button>
      : <button disabled={props.watchBusy} onClick={() => props.run(watchFolder)}>
        <Icon name="folder" size={15} />{props.watchBusy
          ? t('Choosing a folder to watch…')
          : t('Watch folder (automatically import new media)…')}
      </button>)}
  </>;
}
