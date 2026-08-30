import type { ExternalProposalController } from '../../agent/useExternalAgentBridge';
import type { TimelineState } from '../../editor/types';
import { theme } from '../../theme';
import { ExternalProposalCard } from './ExternalProposalCard';

export interface ExternalAgentOverlayProps {
  external: ExternalProposalController;
  onPreviewState: (state: TimelineState | null) => void;
}

/**
 * Floating surface for the MCP browser binding. The editor has no in-app chat;
 * external agents drive it over the bridge, and this is where their edit
 * proposals, live-project confirmations, and bridge errors reach the user.
 * Renders nothing at all while the bridge is idle.
 */
export function ExternalAgentOverlay({ external, onPreviewState }: ExternalAgentOverlayProps) {
  const idle = !external.proposal && !external.pendingGuard && !external.error;
  if (idle) return null;
  return (
    <div
      className="cc-external-agent-overlay"
      data-cc-external-agent-overlay
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 60,
        width: 'min(420px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
        padding: '10px 12px',
        borderRadius: 8,
        border: `0.5px solid ${theme.border}`,
        background: theme.panel,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
      }}
    >
      <ExternalProposalCard external={external} onPreviewState={onPreviewState} />
    </div>
  );
}
