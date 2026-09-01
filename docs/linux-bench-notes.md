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

## Still needs a person — a mouse and a keyboard

None of these can be honestly proven from a script, because they are handled by the
compositor rather than the page:

- [ ] **Drag the top bar** — does the window actually move?
- [ ] **Double-click the top bar** — does it maximize, and does double-clicking the project
      title rename it instead?
- [ ] **The minimize and close buttons** — do they do their jobs?
- [ ] **F11** full screen, and **Ctrl+Q** quit.
- [ ] **The three shortcuts the old menu used to eat**: Ctrl+R (move right to boundary),
      Ctrl+M (delete marker at playhead), Ctrl +/-/0 (timeline zoom) — all three should now
      reach the timeline.
- [ ] **Switch skins with the window maximized** — the bar should repaint immediately.
