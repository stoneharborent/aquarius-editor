<p align="center">
  <img src="public/aquarius-cut-icon.png" width="96" alt="Aquarius Cut" />
</p>

<h1 align="center">Aquarius Cut</h1>

<p align="center"><strong>The professional editing app of AquariusOS.</strong></p>

<p align="center"><sub>Based on <a href="https://github.com/0xsline/OpenChatCut">OpenChatCut</a> · AGPL-3.0-or-later</sub></p>

---

## What this is, in plain words

Aquarius Cut is a **video editing app**. It has the things you'd expect from an editor —
a media pool, a preview window, a multitrack timeline, effects, titles, audio — and one
thing most editors don't: **you can talk to it.** An AI agent sits in the left-hand panel
and can actually do the editing work: cut clips, add transitions, build motion graphics,
generate captions, export the finished file. Everything it does lands on a real timeline
that you can then adjust by hand. Nothing is a black box.

It runs **on your own machine**. Your footage does not get uploaded anywhere. The
transcription, the analysis and the rendering all happen locally, and the app only reaches
the internet if you specifically ask it to use a cloud AI provider and give it a key.

**Aquarius Cut is the editing app for AquariusOS** — Royce's custom Linux operating system.
Linux is its home; the Mac is where it gets built and tested day to day. Same code, both
places.

## Where it came from, and what that means

Aquarius Cut is a **fork** of an open-source project called
[OpenChatCut](https://github.com/0xsline/OpenChatCut). A fork means we took a copy of
someone else's finished, working code and started making it our own. We did not write the
editing engine from scratch — they did, and they deserve the credit.

What we change is everything around it: the app is now fully in English, it wears the
AquariusOS look, its keyboard shortcuts match Final Cut Pro, and it is packaged and named
as Aquarius Cut.

**The licence matters and is not optional.** OpenChatCut is released under the
**AGPL-3.0-or-later**, and so is Aquarius Cut. In practice that means three things:

1. Aquarius Cut stays **open source**. We can never close the source of this app.
2. If we hand anyone a built copy of the app — shipping it inside AquariusOS counts — the
   **source code has to be publicly available** too.
3. The `LICENSE` file in this folder is the actual legal text. **Never delete or edit it.**

Everything in this repo is free to build on and free to ship. It just has to stay open.

---

## Running it on the Mac

The Mac is the day-to-day workbench. Nothing here installs anything or changes your system.

**Before every session, in every new Terminal window**, run this one line first. It points
the terminal at Node 24, which this app needs and which isn't the Mac's default:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

Then go into the project folder:

```bash
cd "/Users/royceadkins/Library/Mobile Documents/com~apple~CloudDocs/Workflow/Branches/Apps/AquariusOS/aquarius-cut"
```

Now pick one of these two.

### The app in a browser tab — `npm run dev`

```bash
npm run dev
```

Wait for it to print a web address, then open **http://localhost:5199** in your browser.
This is the fastest way to see a change: edit a file, save it, and the browser updates on
its own within a second or two. Press `Ctrl+C` in the terminal to stop it.

### The real desktop app — `npm run desktop:dev`

```bash
npm run desktop:dev
```

This opens Aquarius Cut as an actual Mac application window, with its own icon in the dock.
Use this when you're checking anything that only exists in the desktop app: the window
title bar, the app icon, menus, or reading and writing files on disk. It takes a bit longer
to start than the browser version. Close the window, or press `Ctrl+C`, to stop it.

> **Never run `npm install` in this folder.** The `node_modules` folder is a symlink
> pointing somewhere outside iCloud, on purpose, so iCloud doesn't try to sync a hundred
> thousand dependency files. Everything is already installed.

### Checking that nothing broke

```bash
npm test
```

This runs the project's full check suite — several hundred small tests. It is the contract:
if it passes, the change is safe. You can also run one area at a time, which is much
faster, for example:

```bash
npm run verify:desktop-update     # the update system
npm run verify:i18n               # the English/Chinese text
npm run verify:shortcuts          # the keyboard layout
```

---

## Building the Linux version

Linux is where this app actually lives. The Linux build produces an **AppImage** — a single
file that a Linux user can download, mark as runnable, and double-click. No installer, no
package manager, no dependencies to chase.

The command that builds it is:

```bash
npm run desktop:dist:linux
```

**But do not expect that to work from the Mac.** Building a Linux app on a Mac means
packaging binaries for a machine you aren't on; parts of it (the video renderer, the AI
runtime) ship as platform-specific native code and will not come out right. Cross-building
from macOS is not a supported path and never has been.

The real way this gets built is **on a Linux machine, automatically, by GitHub Actions** —
exactly the same pattern the AquariusOS image itself uses: push a change, a Linux machine
in the cloud builds it, and a finished AppImage comes out the other side. The workflow for
that already exists at `.github/workflows/desktop.yml` and is inherited from upstream.

**That is waiting on one decision from Royce:** this repo has no home on GitHub yet. Once
it has one, CI builds turn on, and testing moves to real hardware (the Xbox Ally, the 5090
build) running AquariusOS. Note that publishing built copies is exactly the moment the AGPL
requires the source to be public — so the GitHub repo will need to be a public one.

### Automatic updates are switched off

Upstream OpenChatCut checks GitHub for new OpenChatCut releases and offers to install them.
That has been **disabled**, deliberately and in every layer: our fork must never hand a
user an OpenChatCut release and call it an Aquarius Cut update. They're different apps on
different version lines.

Nothing in the app contacts an update server, and the "check for updates" button is hidden.
When Aquarius Cut has its own release feed, four things get switched back on together, and
each one names the other three in a comment:

| File | What to restore |
|---|---|
| `config/electron-builder.config.mjs` | the `publish` block |
| `src/ui/upstreamUpdate.ts` | `RELEASE_FEED` |
| `desktop/update-service.ts` | `DESKTOP_UPDATE_FEED_CONFIGURED` |
| `.github/workflows/desktop.yml` | the update-metadata artifacts |

---

## Where things live

| Folder | What's in it |
|---|---|
| `src/` | The app you see — the editor UI, the timeline, the agent chat panel. |
| `server/` | The local background service: media processing, transcription, AI provider calls. |
| `desktop/` | The Electron wrapper that turns the web app into a real desktop app. |
| `config/` | Build settings, including `electron-builder.config.mjs` — how the app is packaged. |
| `assets/branding/` | The app icons, and `render-icons.mjs`, the script that generates them. |
| `remotion/` | The rendering engine used for preview and final export. |
| `shared/` | Code used by more than one of the above. |
| `docs/` | Notes about how specific parts work. |
| `CLAUDE.md` | The rules any AI agent working in this repo must follow. Read it first. |

### The icons

Every icon — the Mac `.icns`, the Windows `.ico`, the Linux PNGs, the browser tab icon — is
generated from one source: the AquariusOS logo at
`../os-image/branding/logo.svg`. Never edit an icon file by hand; they get overwritten. To
regenerate them all after the logo changes:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node assets/branding/render-icons.mjs
```

---

## Credit

Aquarius Cut is built on **[OpenChatCut](https://github.com/0xsline/OpenChatCut)** by
0xsline and its contributors, used and redistributed under the **GNU Affero General Public
License, version 3 or later**. The full licence text is in [`LICENSE`](LICENSE). The
upstream release history is preserved in [`CHANGELOG.md`](CHANGELOG.md).
