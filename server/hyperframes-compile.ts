// The second half of "a composition that leaves this route is one the browser's
// template host can compile" — actually compiling it.
//
// `shared/hyperframes-contract.ts` is a regex linter and dependency-free on
// purpose, so it catches shape and forbidden constructs but nothing that only
// shows up when the code runs. A small model reliably produces drafts that lint
// clean and then throw on the first frame: reading a `const` before its
// initializer, calling a method on an undefined prop, a typo'd identifier. Those
// used to reach the timeline as a broken graphic.
//
// So the generation loop compiles each candidate the same way
// `src/template-host.ts` does — Babel with the classic React runtime, evaluated
// in the host's restricted scope — and renders it at the first, a middle and the
// last frame. A throw becomes another lint error, and the repair loop gets the
// message. Babel is imported lazily and only on this path, matching the rule in
// the template host that generated JSX is the only thing allowed to load it.
import { createElement, Fragment, type FC, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Easing,
  interpolate,
  interpolateColors,
  random,
  spring,
} from 'remotion';
import { HYPERFRAMES_ENTRY_PATTERN } from '../shared/hyperframes-contract.ts';

export interface HyperframesCanvas {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
}

export interface HyperframesCompileResult {
  readonly ok: boolean;
  /** Lint-shaped messages, ready to hand straight to the repair prompt. */
  readonly errors: readonly string[];
}

/**
 * Media elements render to nothing here. The check is about whether the
 * composition's own code survives being run, not about loading assets, and the
 * host wraps them in loaders the server has no business starting.
 */
const nothing: FC = () => null;

function scopeFor(frame: number, canvas: HyperframesCanvas): Record<string, unknown> {
  const AbsoluteFill: FC<Record<string, unknown>> = (props) => createElement('div', {
    ...props,
    style: { position: 'absolute', inset: 0, ...(props.style as object | undefined) },
  });
  return {
    React: { createElement, Fragment },
    useCurrentFrame: () => frame,
    useVideoConfig: () => ({
      fps: canvas.fps,
      width: canvas.width,
      height: canvas.height,
      durationInFrames: canvas.durationInFrames,
    }),
    interpolate,
    interpolateColors,
    spring,
    Easing,
    random,
    Img: nothing,
    Video: nothing,
    Audio: nothing,
    Sequence: ((props: { children?: ReactNode }) => createElement(Fragment, null, props.children)) as FC,
    AbsoluteFill,
    staticFile: (path: string) => path,
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}`;
  return String(error);
}

/**
 * Compile and render a candidate composition. Errors come back in the linter's
 * voice so `hyperframesRepairPrompt` can list them without special-casing.
 */
export async function compileHyperframesComposition(
  code: string,
  canvas: HyperframesCanvas,
): Promise<HyperframesCompileResult> {
  const name = HYPERFRAMES_ENTRY_PATTERN.exec(code)?.[1];
  if (!name) return { ok: false, errors: ['the composition has no `const Name = ({ item }) => …` entry point'] };

  let transpiled: string;
  try {
    const Babel = await import('@babel/standalone');
    transpiled = Babel.transform(code, {
      presets: [['react', { runtime: 'classic' }]],
      filename: 'composition.jsx',
    }).code ?? '';
  } catch (error) {
    return { ok: false, errors: [`the composition does not parse: ${describe(error)}`] };
  }
  if (!transpiled) return { ok: false, errors: ['the composition compiled to nothing'] };

  const last = Math.max(0, canvas.durationInFrames - 1);
  const frames = [...new Set([0, Math.floor(last / 2), last])];
  for (const frame of frames) {
    const scope = scopeFor(frame, canvas);
    try {
      // eslint-disable-next-line no-new-func -- the same restricted-scope evaluation src/template-host.ts performs, on code that has already passed the contract linter.
      const factory = new Function(...Object.keys(scope), `"use strict";\n${transpiled}\n;return ${name};`);
      const Component = factory(...Object.values(scope)) as FC<{ item: unknown }>;
      renderToStaticMarkup(createElement(Component, {
        item: { props: {}, width: canvas.width, height: canvas.height },
      }));
    } catch (error) {
      return {
        ok: false,
        errors: [
          `the composition threw while rendering frame ${frame}: ${describe(error)}`
          + ' — it must render at every frame from 0 to the last one, with `item.props` empty',
        ],
      };
    }
  }
  return { ok: true, errors: [] };
}
