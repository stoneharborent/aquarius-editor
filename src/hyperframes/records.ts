// HyperFrames records live in the project's own media pool.
//
// A generation is stored as a `motion-graphic` MediaAsset (`src: ''`, code-backed)
// exactly like the ones `create_motion_graphic_from_code` already registers, with
// two reserved props carrying the brief that produced it. That choice is what
// makes the feature per-project and portable for free: assets are part of
// `ProjectDoc`, so autosave, version history and `.ccproj` export/import already
// round-trip every generation and its source, with no new persistence surface.
//
// Reserved props use the `__` prefix the MG tools already use for `__description`;
// the inspector only renders props declared by a template's propSchema, so they
// never show up as editable fields.
import type { MediaAsset } from '../editor/types';
import type { Tpl } from '../types';

export const HYPERFRAMES_PROMPT_PROP = '__hyperframesPrompt';
export const HYPERFRAMES_CREATED_PROP = '__hyperframesCreatedAt';
/**
 * Set on a generation that was revised from an earlier one: the id of the
 * generation that was handed to the model as the reference, and the change
 * notes that were asked for. Both are OPTIONAL and both are read defensively,
 * so every generation saved before this feature existed still loads — it simply
 * has no origin to show. Nothing is ever written back into an old record.
 */
export const HYPERFRAMES_REFERENCE_PROP = '__hyperframesReferenceId';
export const HYPERFRAMES_NOTES_PROP = '__hyperframesNotes';
/** Category used on the Tpl handed to the timeline drop path. */
export const HYPERFRAMES_CATEGORY = 'hyperframes';

export interface HyperframeRecord {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly createdAt: number;
  readonly code: string;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
  /** The generation this one was revised from, when it was revised from one. */
  readonly referenceId?: string;
  /** What the user asked to change, alongside `referenceId`. */
  readonly notes?: string;
  readonly asset: MediaAsset;
}

/**
 * The earlier generation handed to the model when a revision is requested: its
 * brief and its composition source are what let the model EDIT rather than
 * start over.
 */
export interface HyperframeReference {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly code: string;
}

export function hyperframeReference(record: HyperframeRecord): HyperframeReference {
  return { id: record.id, name: record.name, prompt: record.prompt, code: record.code };
}

/** A generation the user started that has not landed in the pool yet. */
export interface PendingHyperframe {
  readonly id: string;
  readonly prompt: string;
  readonly createdAt: number;
  readonly status: 'running' | 'failed';
  readonly error?: string;
  /** Set when this run is a revision, so the card can say what it came from. */
  readonly reference?: HyperframeReference;
  /** What the user asked to change, alongside `reference`. */
  readonly notes?: string;
  /** Set when the run came from the timeline, so the result can be placed there. */
  readonly placement?: { readonly track: string; readonly startFrame: number };
}

/** Is this pool asset one of ours? Code-backed MG plus our prompt marker. */
export function isHyperframeAsset(asset: MediaAsset): boolean {
  return asset.kind === 'motion-graphic'
    && typeof asset.code === 'string'
    && asset.code.trim().length > 0
    && typeof asset.props?.[HYPERFRAMES_PROMPT_PROP] === 'string';
}

export function toHyperframeRecord(asset: MediaAsset): HyperframeRecord | null {
  if (!isHyperframeAsset(asset)) return null;
  const props = asset.props ?? {};
  const createdAt = props[HYPERFRAMES_CREATED_PROP];
  // Optional on purpose: a record written before revisions existed has neither
  // prop, and reading them this way is the whole migration.
  const referenceId = props[HYPERFRAMES_REFERENCE_PROP];
  const notes = props[HYPERFRAMES_NOTES_PROP];
  return {
    id: asset.id,
    name: asset.name,
    prompt: String(props[HYPERFRAMES_PROMPT_PROP] ?? ''),
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0,
    code: asset.code ?? '',
    width: asset.width ?? 1920,
    height: asset.height ?? 1080,
    durationInFrames: Math.max(1, asset.durationInFrames || 1),
    ...(typeof referenceId === 'string' && referenceId ? { referenceId } : {}),
    ...(typeof notes === 'string' && notes ? { notes } : {}),
    asset,
  };
}

/** Newest first — a generation feed reads backwards. */
export function hyperframeRecords(assets: readonly MediaAsset[]): HyperframeRecord[] {
  return assets
    .map(toHyperframeRecord)
    .filter((record): record is HyperframeRecord => record !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * A short, human card title derived from the brief. Keeps whole words, so
 * "animated lower third for a chef interview" reads as "Animated lower third for a…".
 */
export function hyperframeNameFromPrompt(prompt: string, max = 42): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Hyperframe';
  const capitalized = cleaned[0]!.toUpperCase() + cleaned.slice(1);
  if (capitalized.length <= max) return capitalized;
  const cut = capitalized.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface HyperframeAssetInput {
  readonly id: string;
  readonly prompt: string;
  readonly code: string;
  readonly width: number;
  readonly height: number;
  readonly durationInFrames: number;
  readonly createdAt: number;
  readonly name?: string;
  readonly referenceId?: string;
  readonly notes?: string;
}

/** Build the pool asset that stores one generation. */
export function hyperframeAsset(input: HyperframeAssetInput): MediaAsset {
  return {
    id: input.id,
    name: input.name?.trim() || hyperframeNameFromPrompt(input.prompt),
    kind: 'motion-graphic',
    src: '', // code-backed: there is no media file to point at
    code: input.code,
    durationInFrames: Math.max(1, Math.round(input.durationInFrames)),
    width: Math.round(input.width),
    height: Math.round(input.height),
    props: {
      [HYPERFRAMES_PROMPT_PROP]: input.prompt,
      [HYPERFRAMES_CREATED_PROP]: input.createdAt,
      // Written only when there is something to write, so an ordinary
      // generation's asset keeps exactly the shape it has always had.
      ...(input.referenceId ? { [HYPERFRAMES_REFERENCE_PROP]: input.referenceId } : {}),
      ...(input.notes?.trim() ? { [HYPERFRAMES_NOTES_PROP]: input.notes.trim() } : {}),
    },
  };
}

/**
 * The drag payload shape. The timeline's existing `template` drop path accepts a
 * self-contained Tpl in `payload.data`, so a Hyperframes card drags onto a track
 * through machinery that already exists — and because the Tpl id is the asset id,
 * the placed clip's `templateId` still points back at its pool asset.
 */
export function hyperframeTemplate(record: HyperframeRecord, fps: number): Tpl {
  return {
    id: record.id,
    name: record.name,
    category: HYPERFRAMES_CATEGORY,
    description: record.prompt,
    width: record.width,
    height: record.height,
    fps,
    durationInFrames: record.durationInFrames,
    props: { ...(record.asset.props ?? {}) },
    propSchema: [],
    thumb: null,
    code: record.code,
  };
}

/** Locale-independent short stamp: a card only needs "when", not a full date. */
export function formatHyperframeTimestamp(value: number): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
