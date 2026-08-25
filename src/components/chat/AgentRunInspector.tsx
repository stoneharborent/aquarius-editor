import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/locale';
import {
  loadAgentRuntimeSidecar,
  subscribeAgentRuntime,
  type AgentApprovalRecord,
  type AgentArtifactIndexEntry,
  type AgentCheckpointRecord,
  type AgentRunEvent,
  type AgentToolOutcomeKind,
  type AgentRunRecord,
  type AgentRuntimeSidecar,
} from '../../persist/agentRuntimeStore';
import {
  isServerRunRecord,
  serverEventsForRun,
  serverRunAcceptance,
  serverRunTerminalReason,
} from './serverRunInspector';
import { theme, themeAlpha } from '../../theme';
import { Icon } from '../icons';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type PopoverBox = { left: number; top: number; width: number; maxHeight: number };

const compactNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const mono: CSSProperties = { fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace' };

function useRuntimeSidecar(projectId: string, refreshKey: boolean) {
  const [sidecar, setSidecar] = useState<AgentRuntimeSidecar | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSidecar(null);
    setLoading(true);
    setFailed(false);
    const refresh = async () => {
      try {
        const next = await loadAgentRuntimeSidecar(projectId);
        if (alive) { setSidecar(next); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void refresh();
    const unsubscribe = subscribeAgentRuntime(projectId, () => { void refresh(); });
    return () => { alive = false; unsubscribe(); };
  }, [projectId, refreshKey]);
  return { sidecar, loading, failed };
}

function usePopoverBox(open: boolean, anchor: HTMLElement | null): PopoverBox | null {
  const [box, setBox] = useState<PopoverBox | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) { setBox(null); return; }
    const place = () => {
      const trigger = anchor.getBoundingClientRect();
      const boundary = anchor.closest<HTMLElement>('[data-cc-chat-popover-boundary]')?.getBoundingClientRect();
      const margin = 8;
      const availableWidth = Math.max(240, (boundary?.width ?? window.innerWidth) - margin * 2);
      const width = Math.min(380, availableWidth, window.innerWidth - margin * 2);
      const minLeft = Math.max(margin, (boundary?.left ?? 0) + margin);
      const maxLeft = Math.min(window.innerWidth - width - margin, (boundary?.right ?? window.innerWidth) - width - margin);
      const left = Math.max(minLeft, Math.min(trigger.right - width, Math.max(minLeft, maxLeft)));
      const top = Math.min(trigger.bottom + 6, window.innerHeight - 120);
      setBox({ left, top, width, maxHeight: Math.max(112, window.innerHeight - top - margin) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor, open]);
  return box;
}

function statusLabel(status: string, t: Translate): string {
  return {
    running: t('Running'), waiting_approval: t('Awaiting approval'), awaiting_user: t('Awaiting reply'),
    completed: t('Completed'), failed: t('Failed'), aborted: t('Cancelled'), interrupted: t('Interrupted'),
  }[status] ?? t('Unknown status');
}

function statusColor(status: string): string {
  if (status === 'completed') return theme.success;
  if (status === 'failed') return theme.danger;
  if (status === 'waiting_approval' || status === 'awaiting_user') return theme.gold;
  if (status === 'running') return theme.accent;
  return theme.textDim;
}

function numberText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? compactNumber.format(value) : undefined;
}
function percentText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : undefined;
}


function validTime(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value).toLocaleString()
    : '—';
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function contextMetric(context: unknown, key: string): unknown {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return undefined;
  return Reflect.get(context, key);
}
function cacheMissLabel(value: unknown, t: Translate): string | undefined {
  if (typeof value !== 'string') return undefined;
  return {
    none: t('Cache hit'),
    first_request: t('First request'),
    model_changed: t('Model changed'),
    system_prompt_changed: t('System prompt changed'),
    tool_surface_changed: t('Tool surface changed'),
    idle_ttl_expired: t('Cache expired'),
    unknown: t('Unconfirmed reason'),
  }[value];
}


function isOutcomeKind(value: unknown): value is AgentToolOutcomeKind {
  return typeof value === 'string' && [
    'success', 'validation_failed', 'denied', 'aborted_before_side_effect',
    'stale', 'retryable_failure', 'outcome_unknown', 'terminal_failure',
  ].includes(value);
}


function validToolOutcomes(events: unknown): AgentRunEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter((event): event is AgentRunEvent =>
    !!event && typeof event === 'object' && 'type' in event && event.type === 'tool_outcome');
}

function Metric({ label, value, title }: { label: string; value: string | number | undefined; title?: string }) {
  return <span style={metric} title={title ?? label}><span style={{ color: theme.textDim }}>{label}</span> {value ?? '—'}</span>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section style={section}>
    <h4 style={sectionTitle} title={hint}>{title}{hint && <Icon name="info" size={11} />}</h4>
    {children}
  </section>;
}

function ContextSection({ run, t }: { run: AgentRunRecord; t: Translate }) {
  const context = run.context;
  // 缓存写仅对支持「显式写缓存」的 provider（如 Anthropic）有意义；DeepSeek 等
  // 只有服务器端 prompt 缓存，从不回报缓存写。无值时隐藏，避免显示无意义的 —。
  const cacheWriteTokens = numberText(contextMetric(context, 'cacheWriteTokens'));
  return <Section title={t('Context and tools')} hint={t('Token usage, cache and tool-surface info for this run and the latest model request.')}>
    <div style={subheadInSection}>{t('Latest model request')}</div>
    <div style={metrics}>
      <Metric label={t('Input')} title={t('Input tokens in the latest model request (prompt + tool results).')} value={numberText(contextMetric(context, 'inputTokens'))} />
      <Metric label={t('Output')} title={t('Output tokens returned by the latest model request.')} value={numberText(contextMetric(context, 'outputTokens'))} />
      <Metric label={t('System')} title={t('Input tokens used by the system prompt.')} value={numberText(contextMetric(context, 'systemTokens'))} />
      <Metric label={t('History')} title={t('Input tokens used by the conversation history.')} value={numberText(contextMetric(context, 'historyTokens'))} />
    </div>
    <div style={subheadInSection}>{t('Cache')}</div>
    <div style={metrics}>
      <Metric label={t('Cache read')} title={t('Cache reads: input tokens served from an existing cache this request.')} value={numberText(contextMetric(context, 'cacheReadTokens'))} />
      {cacheWriteTokens !== undefined && (
        <Metric label={t('Cache write')} title={t('Cache writes: input tokens written to the cache this request (only some models).')} value={cacheWriteTokens} />
      )}
      <Metric label={t('Uncached')} title={t('Uncached: input tokens that were not cached and had to be computed.')} value={numberText(contextMetric(context, 'noCacheTokens'))} />
      <Metric label={t('Hit rate')} title={t('Share of total inputs served from cache across this run.')} value={percentText(contextMetric(context, 'cacheHitRatio'))} />
      <Metric label={t('Diagnosis')} title={t('Why the cache last missed, to see why savings were not realized.')} value={cacheMissLabel(contextMetric(context, 'cacheMissReason'), t)} />
    </div>
    <div style={subheadInSection}>{t('Tools')}</div>
    <div style={metrics}>
      <Metric label={t('Active tools')} title={t('Number of tools the model could call on the latest request.')} value={numberText(contextMetric(context, 'activeToolCount'))} />
      <Metric label={t('Tool schemas')} title={t('Number of tool schemas sent to the model with the request.')} value={numberText(contextMetric(context, 'toolSchemaCount'))} />
      <Metric label={t('Schema chars')} title={t('Total characters of all tool schemas, a rough measure of tool-surface size.')} value={numberText(contextMetric(context, 'toolSchemaChars'))} />
    </div>
    <div style={subheadInSection}>{t('Run totals')}</div>
    <div style={metrics}>
      <Metric label={t('Model requests')} title={t('Total model requests issued so far in this run.')} value={numberText(contextMetric(context, 'modelRequestCount'))} />
      <Metric label={t('Total input')} title={t('Sum of input tokens across all model requests in this run.')} value={numberText(contextMetric(context, 'totalInputTokens'))} />
      <Metric label={t('Fresh input')} title={t('Input tokens actually computed from scratch (no cache hit) across this run.')} value={numberText(contextMetric(context, 'totalFreshInputTokens'))} />
      <Metric label={t('Total output')} title={t('Sum of output tokens across all model requests in this run.')} value={numberText(contextMetric(context, 'totalOutputTokens'))} />
      <Metric label={t('Retries')} title={t('Times this run automatically retried a model request after a transient error.')} value={numberText(contextMetric(context, 'totalRetryCount'))} />
      <Metric label={t('Media inputs')} title={t('Number of images sent to the model in this run.')} value={numberText(contextMetric(context, 'totalMediaInputs'))} />
    </div>
  </Section>;
}

function CheckpointSection({ checkpoint, t }: { checkpoint?: AgentCheckpointRecord; t: Translate }) {
  // Same treatment as the archived-results block: hide the section entirely when
  // this run made no context checkpoint, since "no checkpoint on this run" is the
  // normal state and an always-visible empty block is not helpful.
  if (!checkpoint) return null;
  return <Section title={t('Context checkpoint')} hint={t('A summary checkpoint saved when a long conversation was compacted; shows how context was trimmed.')}>
    <div style={detailLine}>{checkpoint.summary || t('No summary')}</div>
    <div style={subtle}>{t('{count} source messages', { count: numberText(checkpoint.sourceMessageCount) ?? '—' })}</div>
    <code title={checkpoint.sourceDigest} style={digest}>{checkpoint.sourceDigest}</code>
    {checkpoint.summaryDigest && <code title={checkpoint.summaryDigest} style={digest}>{checkpoint.summaryDigest}</code>}
  </Section>;
}

function outcomeLabel(event: AgentRunEvent, t: Translate): string {
  const kind = event.outcome?.kind;
  if (!isOutcomeKind(kind)) return t('Unknown outcome');
  const labels: Record<AgentToolOutcomeKind, string> = {
    success: t('Success'),
    validation_failed: t('Validation failed'),
    denied: t('Denied'),
    aborted_before_side_effect: t('Aborted before side effect'),
    stale: t('Stale'),
    retryable_failure: t('Retryable failure'),
    outcome_unknown: t('Outcome unknown'),
    terminal_failure: t('Terminal failure'),
  };
  return labels[kind];
}

function ToolOutcomeSection({ events, t }: { events: unknown; t: Translate }) {
  const outcomes = validToolOutcomes(events).slice(-8).reverse();
  return <Section title={t('Tool outcomes')} hint={t('Recently called tools and their outcomes (latest 8 only).')}>
    {outcomes.length === 0 ? <div style={emptyLine}>{t('No tool outcomes')}</div> : outcomes.map((event) => {
      const detail = firstText(event.outcome?.summary, event.outcome?.code, event.operationId);
      return <div key={event.eventId} style={row}>
        <span style={{ ...statusDot, background: statusColor(event.outcome?.kind === 'success' ? 'completed' : 'failed') }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={rowTitle}><code style={mono}>{textValue(event.toolName) ?? t('Unknown tool')}</code><span>{outcomeLabel(event, t)}</span></div>
          {detail && <div style={subtle}>{detail}</div>}
        </div>
      </div>;
    })}
  </Section>;
}

function approvalLabel(status: string, t: Translate): string {
  return {
    pending: t('Pending'), allowed: t('Allowed'), denied: t('Denied'),
    expired: t('Stale'), cancelled: t('Cancelled'),
  }[status] ?? t('Unknown status');
}

function ApprovalSection({ approvals, t }: { approvals: readonly AgentApprovalRecord[]; t: Translate }) {
  return <Section title={t('Approvals')} hint={t('Confirmation / approval records from this run (first 6 only).')}>
    {approvals.length === 0 ? <div style={emptyLine}>{t('No approval records')}</div> : approvals.slice(0, 6).map((approval) => {
      const detail = firstText(approval.summary, approval.operationId);
      return <div key={approval.approvalId} style={row}>
        <span style={{ ...statusDot, background: statusColor(approval.status === 'allowed' ? 'completed' : approval.status === 'pending' ? 'waiting_approval' : 'failed') }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={rowTitle}><code style={mono}>{textValue(approval.toolName) ?? t('Unknown tool')}</code><span>{approvalLabel(approval.status, t)}</span></div>
          {detail && <div style={subtle}>{detail}</div>}
          <code title={approval.argsDigest} style={digest}>{t('Args digest')} {approval.argsDigest}</code>
        </div>
      </div>;
    })}
  </Section>;
}

function ArtifactSection({ artifacts, t }: { artifacts: readonly AgentArtifactIndexEntry[]; t: Translate }) {
  // Hide the section entirely when there is nothing archived: the "归档结果"
  // block is an internal token-optimization diagnostic that is empty for most
  // runs and confusing as an always-visible empty block.
  if (artifacts.length === 0) return null;
  return <Section title={t('Archived results')} hint={t('Artifacts archived by this run (first 6 only).')}>
    {artifacts.slice(0, 6).map((artifact) => (
      <div key={artifact.artifactId} style={artifactRow}>
        <div style={rowTitle}><code title={artifact.artifactId} style={mono}>{artifact.artifactId}</code><span>{textValue(artifact.toolName) ?? artifact.kind}</span></div>
        <div style={subtle}>{numberText(artifact.originalChars) ?? '—'} {t('characters')} · {numberText(artifact.originalBytes) ?? '—'} {t('bytes')}{artifact.redacted ? ` · ${t('redacted')}` : ''}{artifact.binaryOmitted ? ` · ${t('binary omitted')}` : ''}</div>
        <code title={artifact.bodySha256} style={digest}>SHA-256 {artifact.bodySha256}</code>
      </div>
    ))}
  </Section>;
}

function InspectorContent({ sidecar, loading, failed, t }: {
  sidecar: AgentRuntimeSidecar | null;
  loading: boolean;
  failed: boolean;
  t: Translate;
}) {
  if (loading && !sidecar) return <div role="status" style={emptyState}>{t('Loading run record…')}</div>;
  if (failed && !sidecar) return <div role="alert" style={emptyState}>{t('Unable to load run record')}</div>;
  const run = sidecar?.runs[0];
  if (!run) return <div style={emptyState}><strong>{t('No runs yet')}</strong><span>{t('Run details appear here after you send a message. Interrupted operations are never replayed automatically.')}</span></div>;
  const checkpoint = sidecar.checkpoints.find((item) => item.runId === run.runId);
  const approvals = sidecar.approvals.filter((item) => item.runId === run.runId);
  const artifacts = sidecar.artifacts.filter((item) => item.runId === run.runId);
  // Cumulative totals across every run in this project: the inspector shows the
  // latest run's details, but "几步对话/多少次模型请求" is a project-wide figure.
  const runCount = sidecar.runs.length;
  const totalModelRequests = sidecar.runs.reduce((sum, item) => {
    const value = contextMetric(item.context, 'modelRequestCount');
    return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0);
  const serverRun = isServerRunRecord(run);
  const serverEvents = serverRun ? serverEventsForRun(run) : [];
  const terminalReason = serverRun ? serverRunTerminalReason(run, serverEvents) : undefined;
  const acceptance = serverRun ? serverRunAcceptance(serverEvents) : undefined;
  return <>
    <div style={runSummary}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ ...statusDot, background: statusColor(run.status) }} />
        <strong style={{ color: theme.text, fontSize: 12.5 }}>{statusLabel(run.status, t)}</strong>
        {serverRun && <span style={serverBadge}>{t('Server-side')}</span>}
        <span style={{ marginLeft: 'auto', color: theme.textDim, fontSize: 10.5 }}>{validTime(run.updatedAt)}</span>
      </div>
      <div style={backend}>{textValue(run.backend) ?? t('Unknown backend')} · {textValue(run.modelId) ?? t('Unknown model')}</div>
      <div style={subtle}>{t('{runs} runs total · {requests} cumulative model requests', { runs: numberText(runCount) ?? '0', requests: numberText(totalModelRequests) ?? '0' })}</div>
      <div style={{ ...subtle, marginTop: 4 }}>{run.userInputPreview || t('Request summary was not recorded.')}</div>
    </div>
    {run.status === 'interrupted' && <div role="note" style={interrupted}>{t('This run was interrupted unexpectedly. Nothing will continue or replay automatically. Check external task status before retrying.')}{terminalReason && <div style={reason}>{terminalReason}</div>}</div>}
    {serverRun && run.status !== 'interrupted' && terminalReason && <div role="note" style={serverReason}>{terminalReason}</div>}
    {acceptance && <div role="status" style={serverReason}>{t('Autonomous acceptance: {status} · pass {iteration}/{max}', {
      status: t({ checking: 'Checking', paused: 'Waiting for input', passed: 'Passed', failed: 'Not passed' }[acceptance.status]),
      iteration: acceptance.iteration,
      max: acceptance.maxIterations,
    })}</div>}
    <ContextSection run={run} t={t} />
    <CheckpointSection checkpoint={checkpoint} t={t} />
    <ToolOutcomeSection events={run.events} t={t} />
    <ApprovalSection approvals={approvals} t={t} />
    <ArtifactSection artifacts={artifacts} t={t} />
  </>;
}

export function AgentRunInspector({ projectId }: { projectId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { sidecar, loading, failed } = useRuntimeSidecar(projectId, open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const box = usePopoverBox(open, triggerRef.current);
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }, []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);
  useEffect(() => {
    if (open && box) requestAnimationFrame(() => closeRef.current?.focus());
  }, [box, open]);
  const latest = sidecar?.runs[0];
  return <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="cc-agent-run-inspector"
      title={t('Agent Run Inspector')} aria-label={t('Agent Run Inspector')} onClick={() => setOpen((value) => !value)}
      className="cc-header-btn" style={trigger}>
      <Icon name="list" size={14} />
      {latest && <span aria-hidden style={{ ...triggerDot, background: statusColor(latest.status) }} />}
    </button>
    {open && box && createPortal(
      <div role="presentation" onPointerDown={close} style={backdrop}>
        <section id="cc-agent-run-inspector" role="dialog" aria-label={t('Agent Run Inspector')}
          onPointerDown={(event) => event.stopPropagation()} style={{ ...popover, ...box }}>
          <header style={header}>
            <div><strong style={{ fontSize: 13 }}>{t('Agent Run Inspector')}</strong><div style={subtle}>{t('Read-only diagnostics. No operation will be executed or resumed.')}</div></div>
            <button ref={closeRef} type="button" onClick={close} aria-label={t('Close')} title={t('Close')} className="cc-header-btn" style={closeButton}><Icon name="x" size={14} /></button>
          </header>
          <div style={scroll}><InspectorContent sidecar={sidecar} loading={loading} failed={failed} t={t} /></div>
        </section>
      </div>, document.body,
    )}
  </>;
}

const trigger: CSSProperties = { position: 'relative', width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0, border: 0, borderRadius: 4, background: 'none', color: theme.textDim, cursor: 'pointer', lineHeight: 0 };
const triggerDot: CSSProperties = { position: 'absolute', right: 2, bottom: 2, width: 5, height: 5, borderRadius: '50%', boxShadow: `0 0 0 1px ${theme.panel}` };
const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 70, background: 'transparent' };
const popover: CSSProperties = { position: 'fixed', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: theme.text, border: `0.5px solid ${theme.borderLight}`, borderRadius: 7, background: theme.panelAlt, boxShadow: `0 14px 42px ${themeAlpha.shadow(0.5)}` };
const header: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '11px 12px', borderBottom: `0.5px solid ${theme.border}` };
const closeButton: CSSProperties = { width: 26, height: 26, display: 'grid', placeItems: 'center', flex: '0 0 auto', padding: 0, border: 0, borderRadius: 4, background: 'transparent', color: theme.textDim, cursor: 'pointer' };
const scroll: CSSProperties = { minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' };
const emptyState: CSSProperties = { minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 20, color: theme.textDim, fontSize: 11.5, lineHeight: 1.5, textAlign: 'center' };
const runSummary: CSSProperties = { padding: '10px 12px 9px' };
const statusDot: CSSProperties = { width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%' };
const backend: CSSProperties = { marginTop: 6, color: theme.text, fontSize: 11.5, ...mono };
const interrupted: CSSProperties = { margin: '0 12px 8px', padding: 8, border: `0.5px solid ${theme.gold}`, borderRadius: 4, color: theme.text, background: themeAlpha.ink(0.04), fontSize: 11, lineHeight: 1.45 };
const serverBadge: CSSProperties = { padding: '1px 4px', borderRadius: 3, color: theme.accent, background: themeAlpha.accent(0.12), fontSize: 9.5 };
const reason: CSSProperties = { marginTop: 5, color: theme.textDim, fontSize: 10.5 };
const serverReason: CSSProperties = { margin: '0 12px 8px', padding: 8, border: `0.5px solid ${theme.border}`, borderRadius: 4, color: theme.text, background: themeAlpha.ink(0.03), fontSize: 11, lineHeight: 1.45 };
const section: CSSProperties = { padding: '9px 12px', borderTop: `0.5px solid ${theme.border}` };
const sectionTitle: CSSProperties = { margin: '0 0 7px', color: theme.textMuted, fontSize: 10.5, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 4 };
const subheadInSection: CSSProperties = { margin: '6px 0 4px', color: theme.textMuted, fontSize: 9.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 0.3 };
const metrics: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '5px 10px' };
const metric: CSSProperties = { color: theme.text, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' };
const row: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' };
const artifactRow: CSSProperties = { padding: '5px 0' };
const rowTitle: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, color: theme.text, fontSize: 10.5 };
const detailLine: CSSProperties = { color: theme.text, fontSize: 11, lineHeight: 1.45 };
const subtle: CSSProperties = { color: theme.textDim, fontSize: 10.5, lineHeight: 1.4, overflowWrap: 'anywhere' };
const emptyLine: CSSProperties = { color: theme.textDim, fontSize: 10.5 };
const digest: CSSProperties = { display: 'block', marginTop: 5, color: theme.textDim, fontSize: 9.5, lineHeight: 1.35, overflowWrap: 'anywhere', ...mono };
