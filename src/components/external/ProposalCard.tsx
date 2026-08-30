import { useState } from 'react';
import type { Proposal } from '../../agent/proposal';
import { useT } from '../../i18n/locale';
import { Icon } from '../icons';

export function ProposalCard({ proposal, onApply, onReject, onPreview, stale, onForceApply, onRePropose }: {
  proposal: Proposal;
  onApply: (selected: Set<number>) => void;
  onReject: () => void;
  onPreview: (on: boolean) => void;
  /** Proposal expiration (staleness): Real time footer change, still apply/re-propose/cancel three choices */
  stale?: boolean;
  onForceApply?: (selected: Set<number>) => void;
  onRePropose?: () => void;
}) {
  const t = useT();
  const ops = proposal.options[0].operations;
  const [selected, setSelected] = useState<Set<number>>(() => new Set(ops.map((_, i) => i)));
  const [preview, setPreview] = useState(false);

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const selectAll = () => setSelected(new Set(ops.map((_, i) => i)));
  const selectNone = () => setSelected(new Set());
  const togglePreview = () => {
    const on = !preview;
    setPreview(on);
    onPreview(on);
  };
  const apply = () => { onPreview(false); onApply(selected); };
  const reject = () => { onPreview(false); onReject(); };

  const allOn = selected.size === ops.length;
  const noneOn = selected.size === 0;

  return (
    <div className="cc-proposal">
      <header className="cc-proposal-head">
        <div className="cc-proposal-head-left">
          <span className="cc-proposal-icon" aria-hidden>
            <Icon name="sparkles" size={14} />
          </span>
          <div className="cc-proposal-titles">
            <div className="cc-proposal-title-row">
              <h3 className="cc-proposal-title">{proposal.title || t('Edit proposal')}</h3>
              <span className="cc-proposal-badge">{t('Pending review')}</span>
            </div>
            {proposal.summary ? (
              <p className="cc-proposal-summary">{proposal.summary}</p>
            ) : null}
          </div>
        </div>
        {proposal.totalImpact ? (
          <span className="cc-proposal-impact" title={t('Impact')}>{proposal.totalImpact}</span>
        ) : null}
      </header>

      <div className="cc-proposal-ops-bar">
        <span className="cc-proposal-ops-label">
          {t('Will apply')} <strong>{selected.size}</strong> {t('of {total} ops', { total: ops.length })}
        </span>
        <div className="cc-proposal-ops-actions">
          <button type="button" className="cc-proposal-link" onClick={selectAll} disabled={allOn}>{t('Select all')}</button>
          <button type="button" className="cc-proposal-link" onClick={selectNone} disabled={noneOn}>{t('Clear')}</button>
        </div>
      </div>

      <ul className="cc-proposal-list">
        {ops.map((op, i) => {
          const on = selected.has(i);
          return (
            <li key={i} className={`cc-proposal-op${on ? '' : ' off'}`}>
              <label className="cc-proposal-op-label">
                <input
                  type="checkbox"
                  className="cc-proposal-check"
                  checked={on}
                  onChange={() => toggle(i)}
                />
                <span className="cc-proposal-check-ui" aria-hidden />
                <span className="cc-proposal-op-body">
                  <span className="cc-proposal-op-main">
                    <span className="cc-proposal-op-action">
                      {op.action}{(op.callCount ?? 1) > 1 ? ` ×${op.callCount}` : ''}
                    </span>
                    <span className="cc-proposal-op-target" title={op.target}>{op.target}</span>
                  </span>
                  <span className="cc-proposal-op-meta">
                    <span className="cc-proposal-tool">{op.tool}</span>
                    {op.impact ? <span className="cc-proposal-op-impact">{op.impact}</span> : null}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {stale && (
        <div className="cc-proposal-warning" role="alert">
          {t('The project changed after this proposal was generated — applying as-is may land edits in the wrong place.')}
        </div>
      )}
      <footer className="cc-proposal-foot">
        <button
          type="button"
          className={`cc-proposal-preview${preview ? ' on' : ''}`}
          onClick={togglePreview}
          title={t('Preview the result in the player (does not change the real timeline)')}
        >
          <span className="cc-proposal-preview-dot" />
          {preview ? t('Previewing') : t('Preview result')}
        </button>
        <div className="cc-proposal-foot-right">
          <button type="button" className="cc-proposal-reject" onClick={reject}>{stale ? t('Cancel') : t('Reject')}</button>
          {stale ? (
            <>
              {onRePropose && (
                <button type="button" className="cc-proposal-reject" onClick={() => { onPreview(false); onRePropose(); }}>{t('Re-propose')}</button>
              )}
              <button type="button" className="cc-proposal-apply" disabled={noneOn}
                onClick={() => { onPreview(false); onForceApply?.(selected); }}>
                {t('Apply anyway')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="cc-proposal-apply"
              disabled={noneOn}
              onClick={apply}
            >
              {t('Apply')}{noneOn ? '' : ` ${selected.size}`}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
