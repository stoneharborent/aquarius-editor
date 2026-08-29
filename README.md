<p align="center">
  <img src="public/aquarius-editor-icon.png" width="96" alt="Aquarius Editor" />
</p>

<h1 align="center">Aquarius Editor</h1>

<p align="center"><strong>The professional editing app of AquariusOS.</strong></p>

<p align="center"><sub>Based on <a href="https://github.com/0xsline/OpenChatCut">OpenChatCut</a> · AGPL-3.0-or-later</sub></p>

---

## What this is, in plain words

Aquarius Editor is a **video editing app**. It has the things you'd expect from an editor —
a media pool, a preview window, a multitrack timeline, effects, titles, audio — and one
thing most editors don't: **you can talk to it.** An AI agent sits in the left-hand panel
and can actually do the editing work: cut clips, add transitions, build motion graphics,
generate captions, export the finished file. Everything it does lands on a real timeline
that you can then adjust by hand. Nothing is a black box.

It runs **on your own machine**. Your footage does not get uploaded anywhere. The
transcription, the analysis and the rendering all happen locally, and the app only reaches
the internet if you specifically ask it to use a cloud AI provider and give it a key.

**Aquarius Editor is the editing app for AquariusOS** — Royce's custom Linux operating system.
Linux is its home; the Mac is where it gets built and tested day to day. Same code, both
places.

## Where it came from, and what that means

Aquarius Editor is a **fork** of an open-source project called
[OpenChatCut](https://github.com/0xsline/OpenChatCut). A fork means we took a copy of
someone else's finished, working code and started making it our own. We did not write the
editing engine from scratch — they did, and they deserve the credit.

What we change is everything around it: the app is now fully in English, it wears the
AquariusOS look, its keyboard shortcuts match Final Cut Pro, and it is packaged and named
as Aquarius Editor.

**The licence matters and is not optional.** OpenChatCut is released under the
**AGPL-3.0-or-later**, and so is Aquarius Editor. In practice that means three things:

1. Aquarius Editor stays **open source**. We can never close the source of this app.
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
cd "/Users/royceadkins/Library/Mobile Documents/com~apple~CloudDocs/Workflow/Branches/Apps/AquariusOS/aquarius-editor"
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

This opens Aquarius Editor as an actual Mac application window, with its own icon in the dock.
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

The repo's home is **https://github.com/stoneharborent/aquarius-editor** — public, as the
AGPL requires the moment built copies get handed out. CI there runs only on `v*` tags or a
manual dispatch, so nothing builds until a release is deliberately cut; testing then moves
to real hardware (the Xbox Ally, the 5090 build) running AquariusOS.

That repo's **Issues** are also the app's feedback channel — the in-app GitHub button on the
project dashboard opens it.

---

## How Aquarius Editor updates itself

Aquarius Editor keeps itself up to date from **its own GitHub releases**, so you don't have
to wait for a whole new AquariusOS to get a new editor.

It never updates behind your back. The app looks for a newer version, and if it finds one it
shows a small notice. Nothing is downloaded until you click. Nothing is installed until you
click again. If you ignore it, nothing happens.

There are three ways this plays out, depending on how the app got onto the machine.

### 1. A normal Windows or Linux install

This is a copy you downloaded and installed yourself — the Windows installer, or the Linux
`.AppImage` file you double-click.

1. The app notices there's a newer version and says so.
2. You click **Download update**. A progress percentage appears.
3. When it finishes, the button becomes **Restart and install**.
4. You click it, the app closes, replaces itself, and reopens on the new version.

The old copy is gone at that point — this really is the same program overwriting itself.

### 2. On AquariusOS (the "overlay" way)

AquariusOS is deliberately built so that the operating system **cannot be edited while it's
running**. That's what makes it hard to break: nothing can quietly corrupt it, and you can
always roll the whole system back. Aquarius Editor is baked into that sealed part of the
system, which means it physically cannot overwrite itself the way it does on Windows.

So on AquariusOS it does something different: it installs the new version **next to** the
sealed one, in your own home folder, and the system starts using that instead.

Think of it like a shelf:

- The **sealed copy** that came with your AquariusOS is on the bottom shelf. It never
  changes and it never breaks.
- Each **updated copy** is placed on the shelf above it, in
  `~/.local/share/aquarius/aquarius-editor/versions/`.
- A pointer called `current` says which one to use. When you launch Aquarius Editor, the
  system checks that pointer first, and falls back to the sealed copy if there isn't one.

What actually happens when you accept an update:

1. It downloads the Linux version of the new release, showing a percentage as it goes.
2. It downloads the release's checksum file — a short list of fingerprints published
   alongside the release — and checks the download against it. **If the fingerprint doesn't
   match, the update is thrown away and nothing changes.** That's the protection against a
   half-finished download or a file that got tampered with in transit.
3. It unpacks the new version into your home folder.
4. It moves the `current` pointer to the new version in one instant step. There is no moment
   where the pointer is pointing at nothing.
5. It deletes older copies, keeping only the one now in use. Each copy is about 2 GB, so this
   matters on a handheld.
6. It offers to restart. Restarting goes back through the system's own launcher, which reads
   the pointer and opens the new version.

If anything at all goes wrong in the middle of that — the network drops, the disk fills up,
the fingerprint doesn't match — the half-finished work is deleted and the pointer is left
exactly where it was. **The sealed copy that shipped with the OS is always still there, and
it is always the fallback.** In the worst case you're running the version you already had.

### 3. On the Mac

Mac builds of Aquarius Editor aren't signed with an Apple developer certificate, and macOS
refuses to let an unsigned app replace itself. So on the Mac the notice offers **View
release** instead, which opens the releases page in your browser. You download the new
version and drag it over the old one yourself, the same as any other Mac app.

### The four settings that control all of this

The update system is switched on in four separate files, and they have to agree with each
other. Changing one without the others produces a build that either can't see updates or can
see them but can't install them. Each file names the other three in a comment:

| File | What it holds |
|---|---|
| `config/electron-builder.config.mjs` | `publish` — which GitHub repo releases go to |
| `src/ui/upstreamUpdate.ts` | `RELEASE_FEED` — where the app looks for new versions |
| `desktop/update-service.ts` | `DESKTOP_UPDATE_FEED_CONFIGURED` — the master on/off switch |
| `.github/workflows/desktop.yml` | the `latest-*.yml` and `.blockmap` files a release must contain |

The AquariusOS overlay logic lives on its own in `desktop/overlay-update.ts`, and
`npm run verify:desktop-update` checks all of it.

### Cutting a release

Updates only appear once a release actually exists on GitHub. That is a deliberate,
manual act:

1. Bump the version in `package.json` and add a `CHANGELOG.md` entry.
2. Commit, tag it `v<version>` (the tag must match `package.json` exactly — CI refuses
   otherwise), and push the tag.
3. Run the **desktop** workflow in GitHub Actions against that tag. It builds all four
   installers, smoke-tests each one, creates a draft release, verifies every uploaded file's
   fingerprint, and only then makes the release public.

Existing installs see it on their next check.

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

Aquarius Editor is built on **[OpenChatCut](https://github.com/0xsline/OpenChatCut)** by
0xsline and its contributors, used and redistributed under the **GNU Affero General Public
License, version 3 or later**. The full licence text is in [`LICENSE`](LICENSE). The
upstream release history is preserved in [`CHANGELOG.md`](CHANGELOG.md).
