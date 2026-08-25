# Aquarius Cut — Project Instructions

## What This Is
Aquarius Cut is AquariusOS's professional editing app — a hard fork of
[OpenChatCut](https://github.com/0xsline/OpenChatCut) (AGPL-3.0-or-later), the
open-source local-first AI video editor (Electron + React + TypeScript + Remotion,
multi-track timeline, built-in MCP server). We are converting it fully to English,
theming it with the AquariusOS design system, remapping shortcuts to the Final Cut Pro
layout, and shipping it Linux-first on AquariusOS — while keeping the Mac as the daily
dev/test bench.

**Master plan: `../docs/aquarius-cut-plan.md`** — read it before any work here.

## Standing Facts
- **License is AGPL-3.0-or-later and stays that way.** The fork remains open source;
  credit OpenChatCut in the README. Never remove the LICENSE file.
- **Git remote `upstream`** = the original OpenChatCut repo (for cherry-picking fixes).
  There is no `origin` yet — creating a GitHub home for this repo is Royce's call.
- **Node 24 required.** It is installed keg-only on the Mac; every shell that builds or
  tests must do: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- **`node_modules` is a symlink to `node_modules.nosync/`** so iCloud doesn't sync
  dependencies. Never remove the symlink; `npm install` through it works fine. Agents in
  worktrees: symlink your worktree's `node_modules` to this repo's `node_modules.nosync`.
- Dev commands: `npm run dev` (web, localhost:5199), `npm run desktop:dev` (Electron),
  `npm test` (full verify suite), or targeted `npm run verify:<area>`.

## Rules
1. **The verify suite is the contract.** Any change must leave the relevant
   `verify:*` scripts green; full `npm test` before a stage is called done.
2. **Never leave the repo dirty.** Commit with clear messages at the end of every task.
3. **Design tokens come from `../os-image/branding/tokens.md`** — never pick colors by
   eye. The AquariusOS skin in `src/skins.ts` must match it exactly.
4. **Shortcuts follow Final Cut Pro.** The mapping table `docs/fcp-shortcut-map.md`
   (in this repo) is the law once written; deviations only for actions with no FCP
   equivalent, and they must be documented there.
5. **English only** in UI strings, comments, and docs (the `zh` locale dictionary is the
   one place Chinese remains, as a translation target).
6. **Model split (Royce's rule):** Fable plans, reviews, and coordinates; Opus agents
   implement. Same as the wider AquariusOS project.
7. Plain-language docs — Royce is a beginner at this stack; READMEs and guides assume
   zero prior Electron/Linux knowledge.
