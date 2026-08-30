import { useT } from '../i18n/locale';
import { Icon } from '../components/icons';
import { runAssetDestinationAction, type AssetDestinationActions } from './assetDestination';

interface AssetMenuDestinationsProps {
  assetName: string;
  onAddTimeline?: () => void;
}

export function AssetMenuDestinations({
  assetName,
  onAddTimeline,
}: AssetMenuDestinationsProps) {
  const t = useT();
  if (!onAddTimeline) return null;
  const actions: AssetDestinationActions = { timeline: onAddTimeline };

  return (
    <div className="cc-asset-menu-destinations">
      <span>{t('Add to:')}</span>
      <div className="cc-asset-menu-destination-buttons">
        <button
          type="button"
          className="cc-media-menu-item"
          role="menuitem"
          aria-label={t('Add {name} to timeline', { name: assetName })}
          onClick={() => runAssetDestinationAction('timeline', actions)}
        >
          <span className="cc-media-menu-item-icon" aria-hidden="true"><Icon name="film" size={15} /></span>
          <span className="cc-media-menu-item-label">{t('Timeline')}</span>
        </button>
      </div>
    </div>
  );
}
