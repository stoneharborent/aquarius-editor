import { type CSSProperties } from 'react';
import { useT } from '../i18n/locale';
import { theme } from '../theme';
import { Icon } from './icons';

const PROJECT_REPOSITORY_URL = 'https://github.com/stoneharborent/aquarius-editor';

// Upstream also offered a "Contact author" mail popover next to this link. Aquarius Editor's
// feedback channel is GitHub Issues on the repository above, so the mail control is gone and
// the header keeps a single link.
export function DashboardHeaderLinks() {
  const t = useT();

  return (
    <span style={linkGroup}>
      <a
        href={PROJECT_REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('GitHub repository')}
        data-tip={t('GitHub repository')}
        data-cc-titlebar-control="true"
        className="cc-header-btn cc-tip cc-tip-r"
        style={githubLink}
      >
        <Icon name="github" size={16} />
      </a>
    </span>
  );
}

const linkGroup: CSSProperties = {
  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2,
};
const iconButton: CSSProperties = {
  background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', padding: 6,
  borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const githubLink: CSSProperties = { ...iconButton, textDecoration: 'none' };
