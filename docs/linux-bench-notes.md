# Running and checking Aquarius Editor on AquariusOS

*First written 2026-09-01, the day the bench became the dev machine.*

Until now this app was written on a Mac and guessed at for Linux. The 4090 bench now runs
AquariusOS itself, so the editor is developed on the operating system it ships on. This
file records what that changed, what has actually been checked on real hardware, and what
still needs a person's hands.

## The machine these notes describe

| | |
|---|---|
| OS | AquariusOS 44.20260831.0, **GNOME NVIDIA Edition** |
| Session | Wayland (`XDG_SESSION_TYPE=wayland`, Mutter) |
| GPU | NVIDIA GeForce RTX 4090 |
| Node | 24.20.0, already on `PATH` |
| Checkout | plain ext4 on a local NVMe — **no iCloud**, so none of the iCloud hazards apply |

## The editor runs as a real Wayland app, not through XWayland

This surprised us, so it is worth writing down. Electron used to default to X11, which on a
Wayland desktop means running through the XWayland compatibility layer. **Electron 43 does
not** — with no configuration from us at all, it picks Wayland directly. You can prove it
two ways: `wmctrl -lx` cannot see the editor's window (it only lists X11 windows), and the
app prints this on startup:

```
ERROR:ui/ozone/platform/wayland/gpu/wayland_surface_factory.cc:249]
'--ozone-platform=wayland' is not compatible with Vulkan.
Consider switching to '--ozone-platform=x11' or disabling Vulkan
```

The app runs and draws correctly regardless — this is Chromium declining to use Vulkan for
its own compositing and falling back. **Open question, not yet investigated:** whether that
fallback costs us anything on NVIDIA (playback smoothness, export speed), and whether the
shipped OS launcher should pin a platform rather than leave it to chance.

## How to look inside the running app without a screenshot

GNOME refuses screen captures to anything but the portal, so the usual tools are dead ends
here. Instead, start the app with a debugging port and talk to it directly:

```bash
node scripts/dev-profile.mjs --exec node_modules/.bin/electron \
  desktop-dist/main.mjs --remote-debugging-port=9222
```

Then `http://127.0.0.1:9222/json/list` names the window, and the Chrome DevTools Protocol
will run JavaScript inside it and take a picture of the page itself (`Page.captureScreenshot`,
which is *not* a screen capture and so is not blocked). This is how everything below was
checked. It keeps the isolated dev profile, so your real projects are never touched.

## A trap that will waste an hour if you don't know it

`npm run desktop:dev` rebuilds only the **outer** program. The app's screens come from
whatever is in `dist/`, built whenever somebody last ran `npm run build`. On this bench
`dist/` was three minutes older than the commit that rewrote the window chrome, so the app
came up wearing the *previous* version's interface while reporting a newer version number.
**Run `npm run build` before judging anything you can see.**

## The v0.7.0 window chrome on GNOME — what is confirmed

Checked live, against the real Electron window, with `dist/` freshly built at v0.7.1:

- **The File/Edit menu bar is genuinely gone.** Not hidden — absent.
- **The top strip is the window's title bar**, drawn by the app:
  `header.cc-window-titlebar.cc-window-titlebar--desktop`, 48 px tall on the dashboard.
- **The whole bar is the drag handle** (`-webkit-app-region: drag`), with 11 elements
  opting back out (`no-drag`) so buttons and inputs still take clicks.
- **The app draws its own three window controls** — "Minimize window", "Maximize window",
  "Close window" — and no others.
- **Maximize and restore work through Mutter, and the control follows real window state.**
  One `toggle-maximize` took the window from 1955×1303 to 2793×1465, flipped `maximized`
  to true, and swapped the button's label to "Restore window"; a second call put all three
  back. This is the half the unit tests could never prove.
- **Ice renders as the default skin**: bar paper `#F0F6FC`, ink `#16273A`.

## Checked by hand on the bench, 2026-09-01

Royce drove all of these on the real machine. Everything below passed unless it says
otherwise.

- ✅ **Drag the top bar** — the window moves.
- ✅ **Double-click** — the bar maximizes, and double-clicking the *project title* renames
  instead of maximizing. Both halves of the opt-out work.
- ✅ **Minimize, maximize and close buttons** — all three do their jobs.
- ✅ **F11** full screen and **Ctrl+Q** quit.
- ✅ **Ctrl+R** (move right to boundary) and **Ctrl+M** (delete marker at playhead) — both
  reach the timeline now that the menu is gone. These were genuinely dead before v0.7.0.
- ❌ → ✅ **Ctrl +/−/0 zoomed the whole app instead of the timeline.** A real bug, found
  here and fixed the same day — see below.
- ✅ **Skin switching while maximized** — the title bar repaints immediately, on every skin.

## The one real bug this bench pass found

`zoom-in` / `zoom-out` own `Mod + =` and `Mod + -` in the shortcut catalog — Final Cut's
timeline zoom, and the law per CLAUDE.md rule 4. But `useUiScaleShortcuts` was a global
`window` listener that claimed the same chords for whole-app UI scale and called
`preventDefault()` first. The timeline never zoomed from the keyboard, and the timeline
toolbar's own tooltip — "Zoom in timeline (⌘＋)" — was untrue.

It had been broken since the fork and nobody could see it. Electron's default File/Edit
menu owned `Ctrl +/-/0` as *menu accelerators*, which are handled before the page sees a
key, so **neither** behaviour fired on Linux or Windows. Removing that menu in v0.7.0 is
what let the listener win, which is why v0.7.0's commit message claims those keys "finally
reach the timeline" — they reached the UI-scale hook instead.

Fixed by moving the UI-scale accelerators to **Mod + Alt + = / - / 0** (Royce's call: the
timeline keeps the Final Cut chords; UI scale has no Final Cut equivalent, so it moves).
Deliberately *not* `Mod + Shift + =`, which is the same physical chord as ⌘+ on a US
layout and is already `zoom-in`'s second binding. Written up as conflict 7 in
`docs/fcp-shortcut-map.md`.

Both halves are verified on this bench. Royce confirmed the timeline zooms from the
keyboard again. The UI-scale side was checked by dispatching the real chords into the
running window over CDP: `Ctrl + =` left `devicePixelRatio` at 1.25 (it no longer steals the
key), `Ctrl + Alt + =` moved it to 1.3125, and `Ctrl + Alt + 0` returned it to 1.25 exactly.

**The lesson worth keeping.** `catalog.verify.ts` fails the build if two *catalog actions*
resolve to the same chord — but UI scale was a hand-rolled listener outside the catalog, so
the check was blind to it. A chord claimed anywhere other than the catalog is unguarded.
