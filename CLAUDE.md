# Aquarius Editor — Project Instructions

## What This Is
Aquarius Editor is AquariusOS's professional editing app — a hard fork of
[OpenChatCut](https://github.com/0xsline/OpenChatCut) (AGPL-3.0-or-later), the
open-source local-first AI video editor (Electron + React + TypeScript + Remotion,
multi-track timeline, built-in MCP server). We are converting it fully to English,
theming it with the AquariusOS design system, remapping shortcuts to the Final Cut Pro
layout, and shipping it Linux-first on AquariusOS — while keeping the Mac as the daily
dev/test bench.

**Master plan: `../docs/aquarius-editor-plan.md`** — read it before any work here.

## Standing Facts
- **The product is named "Aquarius Editor".** "Aquarius Cut" was the working name and is
  retired (settled by Royce 2026-08-25). Three things deliberately keep the old spelling
  and must not be "fixed": the master plan
  file (`../docs/aquarius-editor-plan.md`), and quoted historical commit titles. Internal
  storage keys and wire names stay on upstream's spelling too — `~/.openchatcut`, the `cc.*`
  localStorage keys, `openchatcut-plugin@1`, the `openchatcut` MCP server, IPC channel names,
  and `X-OpenChatCut` headers. Renaming those is a separate migration decision.
- **License is AGPL-3.0-or-later and stays that way.** The fork remains open source;
  credit OpenChatCut in the README. Never remove the LICENSE file.
- **Git remote `upstream`** = the original OpenChatCut repo (for cherry-picking fixes).
  **Git remote `origin`** = https://github.com/stoneharborent/aquarius-editor (public,
  created by Royce 2026-08-25 — AGPL requires the source to be public). Push `main`
  there at the end of any completed workstream. CI (`.github/workflows/ci.yml` +
  `desktop.yml`) runs only on `v*` tags or manual dispatch.
- **The dev machine is AquariusOS itself as of 2026-09-01.** Royce's 4090 bench runs the
  GNOME NVIDIA edition, so the editor is now developed and tested on its own target OS.
  The Mac remains a valid second bench; where the two differ, both are written down below.
- **Node 24 required.** On Linux it is already on `PATH` — nothing to do. On the Mac it is
  keg-only, so every shell that builds or tests must first do:
  `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- **Two things a plain `npm install` cannot do by itself.** Both are handled by the repo
  now, but know why they are there before you "clean them up":
  1. `.npmrc` sets `onnxruntime-node-install=skip`. onnxruntime-node@1.22.0's Linux
     install metadata points at `runtimes/win-x64/native/*.so` — Windows paths that do not
     exist in the Linux NuGet package — so without the skip `npm install` fails on **every**
     Linux machine, GPU or not. The CI workflows have always set the same thing via
     `ONNXRUNTIME_NODE_INSTALL`; the CUDA execution provider has never shipped in any build.
     npm warns that this config key is unknown and will stop working in npm 12; if a
     future npm brings the NuGet error back, drop the key and export
     `ONNXRUNTIME_NODE_INSTALL=skip` instead.
  2. `electron@43.1.1` publishes **no** install script (`hasInstallScript: false` in the
     lockfile), so `npm install` never downloads the Electron binary and `desktop:dev`
     cannot start. `npm run electron:ensure` fetches it; `desktop:dev` now runs that first,
     and it costs ~37 ms once the binary is on disk.
- **`node_modules` is a symlink to `node_modules.nosync/` on the Mac only.** That exists so
  iCloud never syncs dependencies. Never remove it there, and agents in Mac worktrees should
  symlink their worktree's `node_modules` to this repo's `node_modules.nosync`. On the Linux
  checkout the vault sits on plain ext4 with no iCloud, `node_modules` is an ordinary
  directory, and none of the iCloud hazards in the parent CLAUDE.md apply.
- Dev commands: `npm run dev` (web, localhost:5199), `npm run desktop:dev` (Electron),
  `npm test` (full verify suite), or targeted `npm run verify:<area>`.
- **Running and inspecting the app on AquariusOS: `docs/linux-bench-notes.md`.**
  It covers the Wayland situation, how to drive the real window over CDP (GNOME blocks
  screen capture), the stale-`dist/` trap, and what the window chrome still needs a
  person to check.

## Rules
1. **The verify suite is the contract.** Any change must leave the relevant
   `verify:*` scripts green; full `npm test` before a stage is called done.
2. **Never leave the repo dirty.** Commit with clear messages at the end of every task.
3. **Design tokens come from the OS, never from the app** — never pick colors by
   eye. AquariusOS's color identity is **Ice** (light-first) with **Midnight** as its
   dark mode, locked by Royce 2026-08-31. The spec is `docs/custom-de/ice-theme-tokens.md`
   on the `research/custom-de` branch of `../os-image` — read it with
   `git -C ../os-image show origin/research/custom-de:docs/custom-de/ice-theme-tokens.md`.
   The `Ice` and `Midnight` skins in `src/skins.ts` must match it exactly; every value
   that the spec does not name is *derived* from one that it does, by a rule written
   next to the value, and `src/skins.verify.ts` re-derives them so a hand-tweak fails.
   The older `../os-image/branding/tokens.md` (Starlight/void) is still the law for the
   legacy `AquariusOS` / `AquariusOS Light` skins only — it is no longer the identity.
4. **Shortcuts follow Final Cut Pro.** The mapping table `docs/fcp-shortcut-map.md`
   (in this repo) is the law once written; deviations only for actions with no FCP
   equivalent, and they must be documented there.
5. **English only** in UI strings, comments, and docs. English is the *source language*:
   `t('English copy')` uses the English string itself as the translation key, and
   `src/i18n/dict/zh/` holds the Chinese translation (plus the Chinese language data the
   runtime needs — agent keyword terms, filler words, CJK font aliases, locale copy
   tables). The only other place Chinese may appear is a test whose whole purpose is CJK
   text handling; those files are listed, with the reason, in `scripts/check-i18n.mjs`.
   `npm run verify:i18n` enforces both halves of this rule.
6. **Model split (Royce's rule):** Fable plans, reviews, and coordinates; Opus agents
   implement. Same as the wider AquariusOS project.
7. Plain-language docs — Royce is a beginner at this stack; READMEs and guides assume
   zero prior Electron/Linux knowledge.
