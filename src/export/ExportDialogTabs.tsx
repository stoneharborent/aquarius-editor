import type { TimelineState } from '../editor/types';
import { trackAlias } from '../editor/types';
import { Icon } from '../components/icons';
import { useT } from '../i18n/locale';
import { captionCues, mediaItems } from '../agent/tools/jianying-export-tool';
import {
  MAX_VIDEO_BITRATE_MBPS,
  MIN_VIDEO_BITRATE_MBPS,
} from './bitrate';
import { ExportBitrateControl } from './ExportBitrateControl';
import { ExportQaCard, InfoCard, Row, Segmented } from './ExportDialogParts';
import {
  EXPORT_FPS,
  EXPORT_RESOLUTION_OPTIONS,
  type ExportSubtitleSettings,
  type ExportVideoSettings,
} from './useExportDialogModel';
import type { ExportQaUiState, ExportTab } from './useExportWorkflow';
import { fcpxmlBackgroundFillCount } from './fcpxml';
import { loadJianYingDraftPreference, saveJianYingDraftPreference, type JianYingDraftStore } from './jianyingDraftPreference';
import { useState } from 'react';

/** macOS default store for JianYing Pro, CapCut's Chinese sibling app; drafts in 6.0+
 * are encrypted and capcut-cli cannot decrypt them, hence the ≤5.9 note. */
const JIANYING_STORE = '~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft';

const resolutionLabel = (value: string): string => value === '4k' ? '4K' : value;
const clampBitrate = (value: number): number => Math.max(
  MIN_VIDEO_BITRATE_MBPS,
  Math.min(MAX_VIDEO_BITRATE_MBPS, value),
);

interface VideoSettingsProps {
  video: ExportVideoSettings;
  busy: boolean;
  qualityMode: 'balanced' | 'master';
  setQualityMode: (mode: 'balanced' | 'master') => void;
}

function VideoSettings({ video, busy, qualityMode, setQualityMode }: VideoSettingsProps) {
  const t = useT();
  return (
    <>
      <Row label={t('Quality policy')}>
        <Segmented
          options={[
            { value: 'balanced', label: t('Balanced') },
            { value: 'master', label: t('Master quality') },
          ]}
          value={qualityMode}
          onChange={setQualityMode}
        />
      </Row>
      <p className="cc-export-footnote">
        {qualityMode === 'master'
          ? t('High-quality preview first; export defaults to high bitrate and never optimizes imports for size.')
          : t('Balance smoothness and size; preview may use lightweight copies and export uses automatic bitrate.')}
      </p>
      <Row label={t('Format / codec')}>
        <select
          className="cc-export-select"
          value={video.codec}
          onChange={(event) => video.setCodec(event.target.value as 'h264' | 'vp8' | 'prores')}
          disabled={busy}
        >
          <option value="h264">MP4 (H.264)</option>
          <option value="vp8">WebM (VP8)</option>
          <option value="prores">{t('ProRes 422 HQ mezzanine (.mov)')}</option>
        </select>
      </Row>
      {video.codec === 'prores' && (
        <p className="cc-export-footnote">
          {t('ProRes mezzanine files are large and server-rendered only. Use them for grading or Resolve handoff; use H.264 for web delivery.')}
        </p>
      )}
      <Row label={t('Resolution')}>
        <Segmented options={EXPORT_RESOLUTION_OPTIONS.map((value) => ({ value, label: resolutionLabel(value) }))} value={video.resolution} onChange={video.setResolution} />
      </Row>
      <Row label={t('Frame rate')}>
        <Segmented options={EXPORT_FPS.map((value) => ({ value, label: `${value} fps` }))} value={video.fps} onChange={video.setFps} />
      </Row>
      {video.codec !== 'prores' && (
        <Row label={t('Bitrate')}>
          <ExportBitrateControl
            mode={video.bitrateMode}
            customMbps={video.customBitrateMbps}
            resolvedBps={video.resolvedBitrate}
            disabled={busy}
            onModeChange={video.setBitrateMode}
            onCustomMbpsChange={(value) => video.setCustomBitrateMbps(clampBitrate(value))}
          />
        </Row>
      )}
    </>
  );
}

interface QaSettingsProps {
  enabled: boolean;
  busy: boolean;
  qa: ExportQaUiState | null;
  onToggle: (enabled: boolean) => void;
}

function QaSettings({ enabled, busy, qa, onToggle }: QaSettingsProps) {
  const t = useT();
  return (
    <>
      <label className="cc-export-toggle cc-export-qa-toggle">
        <span>
          <strong>{t('Automatically quality-check after export')}</strong>
          <small>{t('Checks video, audio, edit points, and caption safe areas; transient failures are retried up to three times.')}</small>
        </span>
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} disabled={busy} />
      </label>
      {qa && <ExportQaCard qa={qa} />}
    </>
  );
}

interface VideoTabProps extends VideoSettingsProps, QaSettingsProps {}

function VideoTab({ video, busy, qualityMode, setQualityMode, enabled, qa, onToggle }: VideoTabProps) {
  return (
    <>
      <VideoSettings video={video} busy={busy} qualityMode={qualityMode} setQualityMode={setQualityMode} />
      <QaSettings enabled={enabled} busy={busy} qa={qa} onToggle={onToggle} />
    </>
  );
}

function AudioTab() {
  const t = useT();
  return <InfoCard icon="music" title={t('MP3 audio mix')} text={t('Extracts the complete timeline mix without writing video frames.')} />;
}

function MotionGraphicsTab({ count }: { count: number }) {
  const t = useT();
  return (
    <InfoCard
      icon="sparkles"
      title={count ? t('{n} motion layers', { n: count }) : t('No motion layers to export')}
      text={count
        ? t('Creates an alpha ProRes 4444 MOV for each layer so it can be reused in other projects.')
        : t('Add motion graphics to the timeline before creating transparent assets.')}
    />
  );
}

function SubtitlesTab({ state, subtitles }: { state: TimelineState; subtitles: ExportSubtitleSettings }) {
  const t = useT();
  return (
    <>
      {!subtitles.tracks.length && (
        <InfoCard icon="captions" title={t('Caption track is off')} text={t('Turn captions on and confirm the content before downloading the caption file.')} />
      )}
      <Row label={t('Caption track')}>
        <select className="cc-export-select" value={subtitles.trackId} disabled={!subtitles.tracks.length} onChange={(event) => subtitles.setTrackId(event.target.value)}>
          {!subtitles.tracks.length && <option value="">—</option>}
          {subtitles.tracks.map((entry) => <option key={entry.id} value={entry.id}>{trackAlias(state, entry.id)}</option>)}
        </select>
      </Row>
      <Row label={t('Format')}>
        <Segmented
          options={[{ value: 'srt', label: 'SubRip (.srt)' }, { value: 'txt', label: 'Plain text (.txt)' }] as const}
          value={subtitles.format}
          onChange={subtitles.setFormat}
        />
      </Row>
    </>
  );
}

interface XmlTabProps {
  state: TimelineState;
  nleFormat: 'fcp_xml' | 'fcp_xml_resolve';
  includeMg: boolean;
  mgCount: number;
  setNleFormat: (format: 'fcp_xml' | 'fcp_xml_resolve') => void;
  setIncludeMg: (include: boolean) => void;
}

function XmlTab({ state, nleFormat, includeMg, mgCount, setNleFormat, setIncludeMg }: XmlTabProps) {
  const t = useT();
  const backgroundFillCount = fcpxmlBackgroundFillCount(state);
  return (
    <>
      <InfoCard icon="clipboard" title={t('Editable project')} text={t('Creates FCPXML with tracks and media references for continued work in Premiere Pro or DaVinci Resolve.')} />
      {backgroundFillCount > 0 && (
        <InfoCard
          icon="film"
          title={t('FCPXML preserves background parameters but does not generate the layer')}
          text={t('OpenChatCut writes the background-fill toggle and percentage for {n} clip(s) into FCPXML metadata, but the destination editor will not reconstruct the blurred layer from it. Export a video master as well for an exact visual match.', {
            n: backgroundFillCount,
          })}
        />
      )}
      <Row label={t('Target app')}>
        <Segmented
          options={[{ value: 'fcp_xml', label: 'Premiere Pro' }, { value: 'fcp_xml_resolve', label: 'DaVinci Resolve' }] as const}
          value={nleFormat}
          onChange={setNleFormat}
        />
      </Row>
      <label className="cc-export-toggle">
        <span><strong>{t('Bundle motion layers')}</strong><small>{t('Also creates alpha ProRes 4444 MOV files.')}</small></span>
        <input type="checkbox" checked={includeMg} onChange={(event) => setIncludeMg(event.target.checked)} disabled={mgCount === 0} />
      </label>
      <p className="cc-export-footnote">{t('After importing, point your NLE at the original media folder to relink offline clips.')}</p>
    </>
  );
}

interface JianyingExportOutcome {
  draftName: string;
  draftPath: string;
  addedVideos: number;
  addedAudios: number;
  captions: number;
  warnings: string[];
}

function JianyingTab({ state, base }: { state: TimelineState; base: string }) {
  const t = useT();
  const initial = loadJianYingDraftPreference();
  const [draftName, setDraftName] = useState(initial.draftName || base);
  const [store, setStore] = useState<JianYingDraftStore>(initial.store);
  const [customDir, setCustomDir] = useState(initial.customDir);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<JianyingExportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftsDir = store === 'jianying' ? JIANYING_STORE : store === 'custom' ? customDir.trim() : '';
  const updateStore = (next: JianYingDraftStore) => {
    setStore(next);
    saveJianYingDraftPreference({ store: next, customDir, draftName: draftName === base ? '' : draftName });
  };
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const body = {
        draftName: draftName.trim(),
        fps: state.fps,
        items: mediaItems(state.items).map((item) => ({
          kind: item.kind,
          src: item.src ?? '',
          startFrame: item.startFrame,
          durationInFrames: item.durationInFrames,
          volume: item.volume,
          name: item.name,
        })),
        captions: captionCues(state, state.captions),
        draftsDir,
      };
      const response = await fetch('/api/external-agent/jianying-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as (JianyingExportOutcome & { ok?: boolean; error?: string }) | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? t('Failed to create the JianYing draft'));
        return;
      }
      saveJianYingDraftPreference({ store, customDir, draftName: draftName.trim() });
      setOutcome(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <InfoCard icon="video" title={t('Create a JianYing draft')}
        text={t('Writes the timeline video, audio and captions into a local draft; open it in JianYing or CapCut to continue editing.')} />
      <Row label={t('Draft name')}>
        <input className="cc-export-select" value={draftName}
          onChange={(event) => setDraftName(event.target.value)} disabled={busy} />
      </Row>
      <Row label={t('Target draft store')}>
        <Segmented
          options={[
            { value: 'capcut', label: 'CapCut store' },
            { value: 'jianying', label: 'JianYing store' },
            { value: 'custom', label: t('Custom path') },
          ] as const}
          value={store}
          onChange={updateStore}
        />
      </Row>
      {store === 'jianying' && <p className="cc-export-footnote">{JIANYING_STORE}</p>}
      {store === 'custom' && (
        <Row label={t('Draft store path')}>
          <input className="cc-export-select" placeholder="~/Movies/.../com.lveditor.draft"
            value={customDir}
            onChange={(event) => {
              setCustomDir(event.target.value);
              saveJianYingDraftPreference({ store, customDir: event.target.value, draftName: draftName === base ? '' : draftName });
            }}
            disabled={busy} />
        </Row>
      )}
      <p className="cc-export-footnote">
        {t('Draft files are encrypted since JianYing 6.0 and this tool writes plaintext drafts, so use JianYing 5.9.0 or earlier; the international CapCut is unaffected.')}
      </p>
      {error && <p className="cc-export-error" role="alert">{error}</p>}
      {outcome && (
        <div className="cc-export-info">
          <span><Icon name="check" size={19} /></span>
          <div>
            <strong>{t('Draft created')} · {outcome.draftName}</strong>
            <p>
              {t('{videos} videos · {audios} audio tracks · {captions} captions', {
                videos: outcome.addedVideos,
                audios: outcome.addedAudios,
                captions: outcome.captions,
              })}
              <br />
              {outcome.draftPath}
              {outcome.warnings.length > 0 && (
                <><br />{outcome.warnings.join('; ')}</>
              )}
            </p>
          </div>
        </div>
      )}
      <button type="button" className="cc-export-cta" onClick={() => void run()} disabled={busy}>
        {!busy && <Icon name="download" size={17} />}
        {busy ? t('Creating draft…') : t('Export to JianYing')}
      </button>
    </>
  );
}

export interface ExportTabContentProps extends VideoTabProps, XmlTabProps {
  tab: ExportTab;
  state: TimelineState;
  subtitles: ExportSubtitleSettings;
  mgCount: number;
  base: string;
}

export function ExportTabContent(props: ExportTabContentProps) {
  if (props.tab === 'video') return <VideoTab {...props} />;
  if (props.tab === 'audio') return <AudioTab />;
  if (props.tab === 'mg') return <MotionGraphicsTab count={props.mgCount} />;
  if (props.tab === 'subtitles') return <SubtitlesTab state={props.state} subtitles={props.subtitles} />;
  if (props.tab === 'jianying') return <JianyingTab state={props.state} base={props.base} />;
  return <XmlTab {...props} />;
}
