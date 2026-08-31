// What the Hyperframes tab (and the timeline popup) shows when generation has
// nowhere to go yet.
//
// There are two ways out of that state and this owns the choice between them:
// let the app fetch its own built-in model — the default, and the one that needs
// no account — or connect a provider. The built-in offer leads, because it is
// the one that ends in "nothing to configure"; the provider card is always one
// click away and takes over entirely on a build where the local runtime cannot
// run at all.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuiltinLlmDownloadState } from '../../shared/builtin-llm-download';
import { HyperframesSetupCard } from './HyperframesSetupCard';
import { BuiltinLlmDownloadCard } from './BuiltinLlmDownloadCard';
import {
  BUILTIN_LLM_POLL_MS,
  declineBuiltinLlmDownload,
  fetchBuiltinLlmState,
  pauseBuiltinLlmDownload,
  startBuiltinLlmDownload,
} from './builtinLlmApi';
import type { HyperframesProblem } from './api';

export interface HyperframesSetupProps {
  /** Re-read the server's view of the configuration — a saved key, or arrived weights. */
  readonly onConfigured: () => void;
  readonly compact?: boolean;
  readonly problem?: HyperframesProblem;
}

export function HyperframesSetup({ onConfigured, compact, problem }: HyperframesSetupProps) {
  const [state, setState] = useState<BuiltinLlmDownloadState | null>(null);
  const [showProvider, setShowProvider] = useState(false);
  const [busy, setBusy] = useState(false);
  const configuredRef = useRef(onConfigured);
  configuredRef.current = onConfigured;
  const lastStatus = useRef<string | null>(null);

  /**
   * Adopt a fresh reading, and tell the tab whenever the ANSWER changed.
   *
   * The tab caches `/api/hyperframes` from its own mount, and the reason it
   * gives for "no model" is part of that answer: `model-missing` disables the
   * prompt bar, `model-downloading` keeps it live so pressing Generate can say
   * "still downloading" rather than swallowing the keystroke. So the refresh has
   * to fire on the transition INTO downloading, not only on completion — and
   * only on transitions, or a one-second poll would drag a config fetch behind
   * it forever.
   */
  const adopt = useCallback((next: BuiltinLlmDownloadState | null) => {
    setState(next);
    const status = next?.status ?? null;
    if (lastStatus.current !== null && lastStatus.current !== status) configuredRef.current();
    lastStatus.current = status;
  }, []);

  // One loop at a time. Pausing and resuming quickly would otherwise leave two
  // timers reading the same endpoint forever.
  const polling = useRef(false);
  const poll = useCallback((): void => {
    if (polling.current) return;
    polling.current = true;
    const tick = async (): Promise<void> => {
      const next = await fetchBuiltinLlmState();
      adopt(next);
      if (next?.status === 'downloading') setTimeout(() => void tick(), BUILTIN_LLM_POLL_MS);
      else polling.current = false;
    };
    setTimeout(() => void tick(), BUILTIN_LLM_POLL_MS);
  }, [adopt]);

  // Poll only while it matters. A finished, absent or paused model is re-read on
  // the next mount; a running download is the only thing that needs a live
  // percentage, and the moment it lands the tab re-reads its config and this
  // whole card unmounts.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const first = await fetchBuiltinLlmState();
      if (!alive) return;
      adopt(first);
      if (first?.status === 'downloading') poll();
    })();
    return () => { alive = false; };
  }, [adopt, poll]);

  const act = useCallback(async (
    action: () => Promise<BuiltinLlmDownloadState | null>,
  ) => {
    setBusy(true);
    try {
      const next = await action();
      adopt(next);
      // A download begun by the button animates immediately rather than waiting
      // for a remount to start the loop.
      if (next?.status === 'downloading') poll();
    } finally {
      setBusy(false);
    }
  }, [adopt, poll]);

  // No local runtime, or a server that will not answer: the built-in route is
  // not available, so do not dangle it — the provider card is the whole answer.
  // A DAMAGED file is not in that list on purpose: the downloader deletes a file
  // that does not match the pin and fetches it again, so re-downloading is the
  // actual repair, and sending someone to find an API key instead would be
  // solving a different problem than the one they have.
  const builtinPossible = state !== null
    && state.runtimeAvailable
    && state.status !== 'ready'
    && problem !== 'runtime-unavailable';

  if (!builtinPossible || showProvider) {
    return (
      <HyperframesSetupCard
        compact={compact}
        problem={problem}
        onSaved={onConfigured}
      />
    );
  }
  return (
    <BuiltinLlmDownloadCard
      state={state}
      busy={busy}
      compact={compact}
      onStart={() => void act(startBuiltinLlmDownload)}
      onPause={() => void act(pauseBuiltinLlmDownload)}
      onDecline={() => void act(declineBuiltinLlmDownload)}
      onUseOwnModel={() => setShowProvider(true)}
    />
  );
}
