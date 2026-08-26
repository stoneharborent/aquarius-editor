# Aquarius Editor — Project Instructions

## What This Is
Aquarius Editor is AquariusOS's professional editing app — a hard fork of
[OpenChatCut](https://github.com/0xsline/OpenChatCut) (AGPL-3.0-or-later), the
open-source local-first AI video editor (Electron + React + TypeScript + Remotion,
multi-track timeline, built-in MCP server). We are converting it fully to English,
theming it with the AquariusOS design system, remapping shortcuts to the Final Cut Pro
layout, and shipping it Linux-first on AquariusOS — while keeping the Mac as the daily
dev/test bench.

**Master plan: `../docs/aquarius-cut-plan.md`** — read it before any work here.

## Standing Facts
- **The product is named "Aquarius Editor".** "Aquarius Cut" was the working name and is
  retired (settled by Royce 2026-08-25). Three things deliberately keep the old spelling
  and must not be "fixed": this **folder** (`.../AquariusOS/aquarius-cut`), the master plan
  file (`../docs/aquarius-cut-plan.md`), and quoted historical commit titles. Internal
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
