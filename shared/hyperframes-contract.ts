// The HyperFrames composition contract — the single description of what a
// generated graphic is allowed to be, shared by the server generator, the
// browser, and the verify suite.
//
// HyperFrames (HeyGen's open framework) authors programmable compositions as
// self-contained animated documents. This editor already hosts programmable
// motion graphics, but its host is NOT a browser document: `src/template-host.ts`
// compiles a no-import `({ item }) => JSX` arrow function inside a restricted
// scope where `window`, `document`, `fetch`, timers and dynamic code are all
// shadowed to `undefined`, and drives it frame by frame through Remotion.
//
// So GSAP — and every other external library — is unreachable, and wall-clock
// animation is impossible by construction. HyperFrames' *authoring discipline*
// carries over exactly (one self-contained composition, no external assets, an
// explicit beat structure, an explicit duration); its HTML/GSAP *dialect* does
// not. Generated compositions are therefore written in the host's own dialect,
// which buys them free preview, scrubbing, timeline hosting and export.
//
// This module is dependency-free on purpose: `server/`, `src/` and bare `tsx`
// verify runs all import it.

/** Globals `src/template-host.ts` injects into a composition (its WHITELIST). */
export const HYPERFRAMES_ALLOWED_GLOBALS = [
  'React', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'interpolateColors',
  'spring', 'Easing', 'random', 'Img', 'Video', 'Audio', 'Sequence', 'AbsoluteFill',
  'staticFile',
] as const;

/** The host's time source. A composition that does not read it cannot be scrubbed. */
export const HYPERFRAMES_TIME_HOOK = 'useCurrentFrame';

/** Canvas/duration source, so a composition adapts to the clip it is placed in. */
export const HYPERFRAMES_CONFIG_HOOK = 'useVideoConfig';

/** Every composition is one `const Name = ({ item }) => …` declaration. */
export const HYPERFRAMES_ENTRY_SIGNATURE = 'const Name = ({ item }) => ( … )';

/**
 * Same shape `src/template-host.ts` looks for when it resolves the component to
 * return from the compiled module. Kept identical so a composition that lints
 * clean here always names successfully there.
 */
export const HYPERFRAMES_ENTRY_PATTERN =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(\s*\{[^)}]*\bitem\b[^)}]*\}/;

/**
 * Rejected constructs. This mirrors the sandbox blocklist in
 * `src/template-host.ts` (`FORBIDDEN`) plus the network-reference rules the
 * generator adds on top, so a composition that reaches the timeline never dies
 * at compile time and never phones home.
 */
export const HYPERFRAMES_FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bimport\s*[({]/, 'dynamic import()'],
  [/(^|[^.\w])import\s+[\w{*"']/m, 'import statement'],
  [/\brequire\s*\(/, 'require()'],
  [/\beval\b/, 'eval (any form)'],
  [/\barguments\b/, 'arguments'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\.\s*constructor\b/, '.constructor (sandbox escape vector)'],
  [/\bwindow\s*[.[]/, 'window access'],
  [/\bdocument\s*[.[]/, 'document access'],
  [/\bglobalThis\b/, 'globalThis'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bnew\s+(XMLHttpRequest|WebSocket|EventSource|Worker)\b/, 'network/worker construction'],
  [/\b(localStorage|sessionStorage|indexedDB)\s*[.[]/, 'storage access'],
  [/\.\s*cookie\b/, 'cookie access'],
  [/\bimportScripts\b/, 'importScripts'],
  [/\b(setTimeout|setInterval)\s*\(/, 'timers (the host drives time, not the composition)'],
  [/while\s*\(\s*true\s*\)/, 'infinite loop while(true)'],
  [/for\s*\(\s*;\s*;\s*\)/, 'infinite loop for(;;)'],
  [/\bdebugger\b/, 'debugger'],
  // Beyond the sandbox: a composition must render identically offline.
  [/\bgsap\b/, 'gsap (unavailable in this host — animate from useCurrentFrame instead)'],
  [/https?:\/\//, 'external URL (compositions must be self-contained)'],
  [/<\s*(script|link|iframe)\b/i, 'external document tag'],
  [/\bDate\s*\.\s*now\s*\(/, 'Date.now() (wall-clock time breaks scrubbing and export)'],
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date() (wall-clock time breaks scrubbing and export)'],
  [/\bperformance\s*\.\s*now\s*\(/, 'performance.now() (wall-clock time breaks scrubbing and export)'],
  [/\bMath\s*\.\s*random\s*\(/, 'Math.random() (use the injected deterministic random())'],
];

export interface HyperframesLintResult {
  readonly ok: boolean;
  /** Component name found by the entry pattern; '' when the entry is missing. */
  readonly name: string;
  readonly errors: readonly string[];
}

/**
 * Models like to wrap code in ```jsx fences and to prefix prose. Peel the first
 * fenced block when one is present, otherwise return the trimmed text.
 */
export function stripCodeFences(raw: string): string {
  const text = String(raw ?? '');
  const fenced = /```(?:[a-zA-Z]*)\n([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}

/** Strip comments so prose inside them cannot trip the blocklist. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Decide whether a composition satisfies the host contract. Pure and
 * synchronous: the server repair loop, the browser and the verify suite all
 * agree because they all call this.
 */
export function lintHyperframesComposition(raw: string): HyperframesLintResult {
  const code = stripCodeFences(raw);
  const errors: string[] = [];
  if (!code) {
    return { ok: false, name: '', errors: ['the composition is empty'] };
  }
  const entry = HYPERFRAMES_ENTRY_PATTERN.exec(code);
  const name = entry?.[1] ?? '';
  if (!name) {
    errors.push(`no entry point: the file must declare exactly one \`${HYPERFRAMES_ENTRY_SIGNATURE}\``);
  }
  const scan = stripComments(code);
  for (const [pattern, reason] of HYPERFRAMES_FORBIDDEN) {
    if (pattern.test(scan)) errors.push(`forbidden construct: ${reason}`);
  }
  if (!new RegExp(`\\b${HYPERFRAMES_TIME_HOOK}\\s*\\(`).test(scan)) {
    errors.push(
      `the composition never calls ${HYPERFRAMES_TIME_HOOK}(): animation must be driven by the `
      + 'host frame so scrubbing and export match playback',
    );
  }
  return { ok: errors.length === 0, name, errors };
}

/** Clip length in frames, clamped to what the host and the UI can carry. */
export const HYPERFRAMES_MIN_FRAMES = 12;
export const HYPERFRAMES_MAX_FRAMES = 1800;

export function clampHyperframesDuration(frames: unknown, fallback: number): number {
  const value = typeof frames === 'number' && Number.isFinite(frames) ? Math.round(frames) : fallback;
  return Math.min(HYPERFRAMES_MAX_FRAMES, Math.max(HYPERFRAMES_MIN_FRAMES, value));
}
