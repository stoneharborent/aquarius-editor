// The authoring prompt for HyperFrames generation.
//
// It is deliberately built FROM `hyperframes-contract.ts` rather than beside
// it: the rules the model is told are literally the rules the linter enforces,
// so the repair loop can never chase a contract the prompt never stated.
import {
  HYPERFRAMES_ALLOWED_GLOBALS,
  HYPERFRAMES_CONFIG_HOOK,
  HYPERFRAMES_ENTRY_SIGNATURE,
  HYPERFRAMES_FORBIDDEN,
  HYPERFRAMES_TIME_HOOK,
} from './hyperframes-contract';

export interface HyperframesRequestContext {
  /** What the user typed. */
  readonly prompt: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
  /** Present when this run revises an earlier generation instead of starting over. */
  readonly revision?: HyperframesRevisionContext;
}

export interface HyperframesRevisionContext {
  /** The brief that produced the graphic being revised. */
  readonly referencePrompt: string;
  /** That graphic's composition source — the thing the model is asked to edit. */
  readonly referenceCode: string;
  /** What the user wants changed about it. */
  readonly notes: string;
}

/**
 * How much of a reference composition may ride along in the request.
 *
 * The built-in model opens an 8192-token context (`shared/llm-model-catalog.ts`)
 * and reserves 1600 of those for its answer. The system prompt alone is roughly
 * 2000 tokens, and the repair loop appends a rejected draft plus its errors on
 * every retry — so the reference has to fit in what is left with room for two
 * repairs. 6000 characters is about 1700 tokens at the ~3.5 chars/token that
 * this kind of source measures at, which leaves the repair turns their room.
 * A real composition is 1-3 KB, so this ceiling is a guard rail, not a normal
 * code path.
 */
export const HYPERFRAMES_REFERENCE_CODE_BUDGET = 6000;

/**
 * Trim a reference composition to the budget, keeping BOTH ends.
 *
 * The head of a composition declares the component, reads its props and defines
 * the beats; the tail returns the JSX that lays them out. Cutting either end
 * off would hide half of what a revision has to edit, so an oversized reference
 * loses its middle and says so, rather than losing its ending.
 */
export function truncateHyperframesReferenceCode(
  code: string,
  budget: number = HYPERFRAMES_REFERENCE_CODE_BUDGET,
): string {
  const trimmed = code.trim();
  if (trimmed.length <= budget) return trimmed;
  const marker = '\n\n// … middle of the composition omitted to fit the model\'s context …\n\n';
  const keep = Math.max(0, budget - marker.length);
  const head = Math.ceil(keep * 0.6);
  return `${trimmed.slice(0, head)}${marker}${trimmed.slice(trimmed.length - (keep - head))}`;
}

const EXAMPLE_TEXT = `const LowerThirdSweep = ({ item }) => {
  const frame = ${HYPERFRAMES_TIME_HOOK}();
  const { fps, durationInFrames } = ${HYPERFRAMES_CONFIG_HOOK}();
  const p = item.props || {};
  const title = p.title || 'Jane Rivera';
  const subtitle = p.subtitle || 'Director of Photography';
  const accent = p.accentColor || '#4ee1a0';

  // Beat 1 — the bar sweeps in.
  const sweep = spring({ frame, fps, config: { damping: 16, stiffness: 130 } });
  // Beat 2 — the text rises a few frames later.
  const rise = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } });
  // Beat 3 — everything eases out at the tail of the clip.
  const out = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 96 }}>
      <div style={{ opacity: out, transform: \`translateX(\${(1 - sweep) * -80}px)\` }}>
        <div style={{ width: 8 * sweep * 40, height: 6, background: accent, borderRadius: 99 }} />
        <div style={{ opacity: rise, transform: \`translateY(\${(1 - rise) * 24}px)\` }}>
          <div style={{ fontSize: 72, fontWeight: 800, color: '#fff' }}>{title}</div>
          <div style={{ fontSize: 34, fontWeight: 500, color: accent }}>{subtitle}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};`;

// A deliberately different second example. The first one is all text in a
// corner, and a small model shown only that will answer every brief with a
// lower third. This one is a moving shape with no text at all, and it
// demonstrates the two things briefs ask for most often and small models get
// wrong: a keyframe list whose values REVERSE (a real bounce, not a slide) and
// a colour that comes from the brief rather than from the example.
const EXAMPLE_SHAPE = `const PulseDot = ({ item }) => {
  const frame = ${HYPERFRAMES_TIME_HOOK}();
  const { fps, height, durationInFrames } = ${HYPERFRAMES_CONFIG_HOOK}();
  const p = item.props || {};
  const color = p.color || '#ff3b30';
  const size = p.size || 160;

  // Beat 1 — drop in from above the frame and settle.
  const drop = spring({ frame, fps, config: { damping: 9, stiffness: 180 } });
  // Beat 2 — two bounces. The offsets go down, back up, down again: a bounce is
  // a list of frames whose values REVERSE direction, not one straight ramp.
  const bounce = interpolate(
    frame,
    [14, 30, 46, 60, 74],
    [0, -140, 0, -56, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  // Beat 3 — shrink away before the clip ends.
  const out = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: color,
          transform: \`translateY(\${(1 - drop) * -height + bounce}px) scale(\${out})\`,
        }}
      />
    </AbsoluteFill>
  );
};`;

/**
 * The authoring system prompt. Describes the host contract (canvas, fps,
 * duration, and above all how the host drives time) plus the HyperFrames way of
 * structuring a composition.
 */
export function hyperframesSystemPrompt(): string {
  const forbidden = HYPERFRAMES_FORBIDDEN.map(([, reason]) => `- ${reason}`).join('\n');
  return `You author HyperFrames compositions for a video editor's motion-graphics host.

A HyperFrames composition is one self-contained programmable graphic: no external
assets, no external libraries, no network, an explicit beat structure and an
explicit duration. This host runs those compositions as React + Remotion elements
rather than as an HTML document, so you write the HyperFrames idea in the host's
dialect. GSAP and every other library are unavailable — there is no document, no
window and no script loading.

# The host contract

- Emit ONE declaration and nothing else: \`${HYPERFRAMES_ENTRY_SIGNATURE}\`.
  No imports, no exports, no render call, no surrounding prose.
- These globals are injected and are the ONLY ones you may use:
  ${HYPERFRAMES_ALLOWED_GLOBALS.join(', ')}.
- TIME IS DRIVEN BY THE HOST. Read the current frame with
  \`const frame = ${HYPERFRAMES_TIME_HOOK}();\` and derive EVERY animated value from
  it. The host re-renders the composition at whatever frame the user scrubs to,
  and renders the same frames again headlessly on export. An animation that runs
  itself on wall-clock time would freeze while scrubbing and come out wrong on
  export, so it is rejected.
- Read the canvas from \`const { fps, width, height, durationInFrames } = ${HYPERFRAMES_CONFIG_HOOK}();\`.
  Never hardcode the canvas size; lay out against these values (or against
  \`item.width\` / \`item.height\`).
- \`interpolate(frame, [inFrame, outFrame], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })\`
  and \`spring({ frame, fps, config: { damping, stiffness } })\` are how you move things.
  Offset the frame (\`frame - 8\`) to stagger a beat.
- Text and shapes are ordinary JSX with inline \`style\` objects, wrapped in
  \`<AbsoluteFill>\`. Use system font stacks only.
- Expose the copy and colours a user would want to change as \`item.props\` reads
  with sensible fallbacks: \`const title = p.title || 'Fallback';\`.
- Leave the background transparent unless the graphic is meant to be a full card —
  it composites over the clips beneath it on the timeline.

# Forbidden — the composition is rejected if it contains any of these

${forbidden}

# Structure a composition the HyperFrames way

1. Read props with fallbacks.
2. Name each beat (entrance, hold, exit) as its own frame-derived value, with a
   comment saying which beat it is.
3. Compose the beats into the layout. A graphic starts from nothing and leaves to
   nothing: at frame 0 and at \`durationInFrames\` it must not already be sitting
   in its settled state, and it must always fade or move out before the clip ends
   so it does not cut hard.

# Build what the brief actually says

The brief is literal. Read it back before you answer and make each of these true:

- A named DIRECTION fixes the sign of the offset. "From the right" starts at a
  POSITIVE \`translateX\` and settles to 0; "from the left" starts negative.
- A named COLOUR is the colour you paint. "A red circle" is red — never the
  accent colour from an example.
- A named COUNT or SEQUENCE has to change value across the clip, and in the
  stated order. Derive it from the frame, e.g. counting 5 down to 1 is
  \`const n = 5 - Math.floor(frame / (durationInFrames / 5));\` clamped to 1.
- A named MOTION has to be that motion. A bounce reverses direction (see the
  second example); a slide does not.
- Anything the brief does not mention, leave out. Do not add a title to a
  graphic that is only a shape.

# Two examples of the exact expected output shape

They show the SHAPE of an answer, never its content. Never reuse their names,
copy, colours or layout — build the brief you were given.

${EXAMPLE_TEXT}

${EXAMPLE_SHAPE}

Reply with the composition source only. No explanation, no markdown fences.`;
}

/**
 * The per-request user message: the brief plus the clip it has to fit.
 *
 * A revision is the same message with the earlier graphic attached: its brief,
 * its source and the change the user asked for. The instruction is deliberately
 * "edit this" rather than "build this", because the point of a revision is to
 * keep everything the user did not complain about.
 */
export function hyperframesUserPrompt(context: HyperframesRequestContext): string {
  const seconds = (context.durationInFrames / Math.max(1, context.fps)).toFixed(1);
  const canvas = `Canvas: ${context.width}x${context.height} at ${context.fps} fps.
Clip length: ${context.durationInFrames} frames (~${seconds}s) — time the beats to fill it.`;
  const revision = context.revision;
  if (!revision) {
    return `Graphic to build: ${context.prompt}

${canvas}`;
  }
  return `Revise an existing graphic. Edit the composition below — keep everything the
change notes do not ask you to change, and rewrite only what they do.

Original brief: ${revision.referencePrompt}

Original composition:
${truncateHyperframesReferenceCode(revision.referenceCode)}

What should change: ${revision.notes}

Brief for this revision: ${context.prompt}

${canvas}

Reply with the complete revised composition source only — the whole declaration,
not a patch or a fragment.`;
}

/** Follow-up message for the repair loop when a draft failed the contract. */
export function hyperframesRepairPrompt(errors: readonly string[]): string {
  return `That composition was rejected by the host:

${errors.map((error) => `- ${error}`).join('\n')}

Rewrite the whole composition so it passes. Reply with the composition source only.`;
}
