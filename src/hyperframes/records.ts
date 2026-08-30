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
  readonly asset: MediaAsset;
}

/** A generation the user started that has not landed in the pool yet. */
export interface PendingHyperframe {
  readonly id: string;
  readonly prompt: string;
  readonly createdAt: number;
  readonly status: 'running' | 'failed';
  readonly error?: string;
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
  return {
    id: asset.id,
    name: asset.name,
    prompt: String(props[HYPERFRAMES_PROMPT_PROP] ?? ''),
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0,
    code: asset.code ?? '',
    width: asset.width ?? 1920,
    height: asset.height ?? 1080,
    durationInFrames: Math.max(1, asset.durationInFrames || 1),
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
