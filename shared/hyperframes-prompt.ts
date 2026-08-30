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
}

const EXAMPLE = `const LowerThirdSweep = ({ item }) => {
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
3. Compose the beats into the layout. Always fade or move the graphic out before
   \`durationInFrames\` so it does not cut hard.

# Example of the exact expected output shape

${EXAMPLE}

Reply with the composition source only. No explanation, no markdown fences.`;
}

/** The per-request user message: the brief plus the clip it has to fit. */
export function hyperframesUserPrompt(context: HyperframesRequestContext): string {
  const seconds = (context.durationInFrames / Math.max(1, context.fps)).toFixed(1);
  return `Graphic to build: ${context.prompt}

Canvas: ${context.width}x${context.height} at ${context.fps} fps.
Clip length: ${context.durationInFrames} frames (~${seconds}s) — time the beats to fill it.`;
}

/** Follow-up message for the repair loop when a draft failed the contract. */
export function hyperframesRepairPrompt(errors: readonly string[]): string {
  return `That composition was rejected by the host:

${errors.map((error) => `- ${error}`).join('\n')}

Rewrite the whole composition so it passes. Reply with the composition source only.`;
}
