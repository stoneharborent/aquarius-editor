# Aquarius Editor — Final Cut Pro keyboard map

*Stage 3 of the Aquarius Editor conversion (`../../docs/aquarius-editor-plan.md`). Written 2026-08-25.*

**This file is the law.** `CLAUDE.md` rule 4: shortcuts follow Final Cut Pro, and any binding
that does not is a deviation that has to appear in the table below with a reason. If you change
a binding in `src/shortcuts/catalog.ts`, change the matching row here in the same commit.

## How to read this

- The catalog holds **58 actions**. Every one of them is in the tables below — nothing is omitted.
- **Mod** = ⌘ on macOS, **Ctrl** on Linux and Windows. **Alt** = ⌥ on macOS. **Ctrl** written on
  its own always means the literal Control key, on every platform.
- The Shortcuts dialog (⌥⌘K) prints macOS glyphs on a Mac and spelled-out names elsewhere, so the
  same catalog reads correctly on AquariusOS.
- **Status column:**
  - **FCP** — the same chord Final Cut Pro uses for the same job.
  - **FCP-ish** — the FCP chord, on an action whose behaviour is close but not identical.
  - **Standard** — no FCP command exists, but the chord is the universal macOS/desktop one
    (⌘Z, ⌘C, ⌘S…). FCP uses these too.
  - **Extension** — Aquarius Editor has a feature Final Cut Pro does not. Documented deviation.
- Every user can rebind any row from the Shortcuts dialog; overrides live in `localStorage`
  (`cc.keymap.v1`) and never touch this default preset.

## Playback

| Action (id) | Old binding | New binding | Final Cut Pro | Status | Notes |
|---|---|---|---|---|---|
| Play / Pause (`play-pause`) | Space | **Space** | Space | FCP | Unchanged. |
| Previous frame (`seek-back`) | ← | **←** | ← | FCP | Unchanged. |
| Next frame (`seek-fwd`) | → | **→** | → | FCP | Unchanged. |
| Step back 10 frames (`seek-back-sec`) | Shift + ← | **Shift + ←** | ⇧← | FCP | Chord unchanged, **behaviour changed**: was one second (fps-dependent), now a flat 10 frames as in FCP. Label updated. |
| Step forward 10 frames (`seek-fwd-sec`) | Shift + → | **Shift + →** | ⇧→ | FCP | Same as above. |
| Shuttle backward (`shuttle-back`) | J | **J** | J | FCP | Rate stacks on repeat presses, as in FCP. |
| Shuttle forward (`shuttle-fwd`) | L | **L** | L | FCP | |
| Shuttle pause (`shuttle-pause`) | K | **K** | K | FCP | |
| Jog back one frame (`shuttle-jog-back`) | K + J | **K + J** | K+J | FCP | Hold K, tap J. |
| Jog forward one frame (`shuttle-jog-fwd`) | K + L | **K + L** | K+L | FCP | |

## Edit

| Action (id) | Old binding | New binding | Final Cut Pro | Status | Notes |
|---|---|---|---|---|---|
| Undo (`undo`) | Mod + Z | **Mod + Z** | ⌘Z | Standard | |
| Redo (`redo`) | Mod + Shift + Z / Mod + Y | **Mod + Shift + Z / Mod + Y** | ⇧⌘Z | Standard | ⌘Y kept as a Windows/Linux habit alias. |
| Copy (`copy`) | Mod + C | **Mod + C** | ⌘C | Standard | Skipped when interface text is selected, so the browser's own copy still works. |
| Cut (`cut`) | Mod + X | **Mod + X** | ⌘X | Standard | |
| Paste (`paste`) | Mod + V | **Mod + V** | ⌘V | Standard | Pastes at the playhead. |
| Paste Effects (`paste-effects`) | Mod + Alt + V / Mod + Shift + B | **Mod + Shift + V / Mod + Alt + V** | ⇧⌘V ("Paste Attributes") | Match | ⇧⌘V is FCP's Paste Attributes (strict parity, added 2026-08-25 per Royce's FCP-parity directive). ⌘⌥V kept as a secondary alias (Premiere's Paste Attributes — helpful cross-NLE muscle memory). The old ⌘⇧B alias is **dropped** — B is blade territory now. |
| Duplicate (`duplicate`) | Mod + D | **Mod + D** | ⌘D (duplicates a project, not a clip) | Extension | FCP has no "duplicate clip on the timeline". ⌘D is the desktop-standard duplicate and is kept. |
| Delete (`delete`) | Backspace / Delete | **Backspace / Delete / Shift + Backspace / Shift + Delete** | ⌫ = ripple delete, ⇧⌫ = delete leaving a gap | Deviation | Aquarius Editor is **inverted** from FCP: plain deletes and leaves the gap, Shift ripple-deletes. That behaviour is unchanged (it matches the clip context menu and the rest of the app); only the missing Shift chords were added — before this, Shift + ⌫ matched nothing and ripple-delete-by-keyboard silently did nothing. |
| Split (`split`) | C / Enter | **Mod + B** | ⌘B ("Blade") | FCP | The headline change. C and Enter are freed. |
| Selection Mode (`interaction-mode-selection`) | V | **A** | A (Select tool) | FCP | V is freed. |
| Trim Edit Mode (`interaction-mode-trim`) | N | **T** | T (Trim tool) | FCP | N is freed — and immediately reused for snapping. |
| Slip Edit Mode (`interaction-mode-slip`) | U | **U** | — | Extension | FCP has no slip *tool*; slipping is done by dragging the middle of a clip with the Trim tool. U is left where it was. |
| Blade Edit Mode (`interaction-mode-blade`) | B | **B** | B (Blade tool) | FCP | Already correct. |
| Pen Edit Mode (`interaction-mode-pen`) | P | **P** | P is FCP's *Position* tool | Extension | Aquarius Editor has a keyframe pen and no position tool. P is kept because "P = pen" is the industry habit (Premiere, Resolve); the FCP Position tool has no equivalent to collide with. |
| Nudge left 1 / 10 frames (`nudge-left`) | E / Shift + E | **, / Shift + ,** | , / ⇧, | FCP | Shift step changed from 5 to 10 frames to match FCP. E is freed. |
| Nudge right 1 / 10 frames (`nudge-right`) | R / Shift + R | **. / Shift + .** | . / ⇧. | FCP | R is freed. |
| Trim start (`trim-start`) | Q | **Alt + [** | ⌥[ ("Trim Start") | FCP | Q is freed. |
| Trim end (`trim-end`) | W | **Alt + ]** | ⌥] ("Trim End") | FCP | W is freed. |
| Append selected library item (`library-append`) | — | **E** | E ("Append to Storyline") | FCP | New in 2026-09-02. Acts on the card selected in a Library tab (`src/library/librarySelection.ts`), and does nothing when nothing is selected. Appends after the last clip on the item's own lane (V1 for pictures, A1 for audio). This and the two rows below are why E, W and Q were held free by the remap. |
| Insert selected library item at playhead (`library-insert`) | — | **W** | W ("Insert") | FCP | Places at the playhead on the item's own lane and ripples later clips right, the way FCP's insert edit does. |
| Connect selected library item at playhead (`library-connect`) | — | **Q** | Q ("Connect to Primary Storyline") | FCP-ish | Aquarius Editor has tracks, not a primary storyline with connected clips, so "connect" means the first lane *above* the main one that is free for the clip's whole length — a new top lane is created when every existing one is busy. |
| Select all (`select-all`) | Mod + A | **Mod + A** | ⌘A | FCP | Suppressed while typing so ⌘A still selects text in the inspector. |
| Select clips forward (`select-after`) | Y | **Y** | — | Extension | Nearest FCP idea is a range selection; Premiere's Track Select Forward is A, which is now the Select tool. Y stays. |
| Move clip up (`move-up`) | Alt + ↑ | **Alt + ↑** | ⌥↑ (move a connected clip up a lane) | FCP-ish | Same gesture, applied to this app's track model. |
| Move clip down (`move-down`) | Alt + ↓ | **Alt + ↓** | ⌥↓ | FCP-ish | |
| Move left to boundary (`move-left-boundary`) | Ctrl + E | **Ctrl + E** | — | Extension | Snaps the selected clip against its left-hand neighbour. No FCP command. Left on Ctrl + E, which does not collide with the now-free bare E. |
| Move right to boundary (`move-right-boundary`) | Ctrl + R | **Ctrl + R** | — | Extension | As above. |
| Save version (`save-version`) | Mod + S | **Mod + S** | ⌘S | Standard | FCP saves continuously; ⌘S is the expected key for "snapshot this cut". |

## Navigation

| Action (id) | Old binding | New binding | Final Cut Pro | Status | Notes |
|---|---|---|---|---|---|
| Previous edit (`prev-edit`) | ↑ | **↑** | ↑ | FCP | |
| Next edit (`next-edit`) | ↓ | **↓** | ↓ | FCP | |
| Mark in (`zone-in`) | I | **I** | I | FCP | |
| Mark out (`zone-out`) | O | **O** | O | FCP | |
| Clear marks (`zone-clear`) | X | **Alt + X** | ⌥X ("Clear Selected Ranges") | FCP | |
| Mark clip at playhead (`zone-clip`) | / | **X** | X ("Mark Clip") | FCP | The old `/` binding never worked anyway: binding strings split alternatives on `/`, so a lone `/` parsed to nothing. |
| Mark selection (`zone-selection`) | *(none)* | **(none)** | — | Extension | Deliberately unbound: no FCP command, and no key left worth spending. Still reachable from the agent and menus. Note that an unbound row does not appear in the Shortcuts dialog, so it cannot currently be bound from the UI. |

## Markers

| Action (id) | Old binding | New binding | Final Cut Pro | Status | Notes |
|---|---|---|---|---|---|
| Add marker (`marker-add`) | M | **M** | M | FCP | |
| Add marker and open dialog (`marker-shortcut-add-and-open`) | Mod + M | **Alt + M** | ⌥M ("Add Marker and Modify") | FCP | ⌘M is reserved by macOS for Minimize Window, so the old binding was unusable on the dev bench. |
| Modify marker at playhead (`marker-modify-at-playhead`) | Shift + M | **Shift + M** | — | Extension | FCP folds this into ⌥M. Aquarius Editor keeps a separate "edit the marker already here" command on ⇧M. |
| Delete marker at playhead (`marker-delete-at-playhead`) | Alt + M | **Ctrl + M** | ⌃M ("Delete Marker") | FCP | Moved off ⌥M to resolve the collision the remap created — and Ctrl + M is FCP's real binding, so the move is a gain. |
| Previous marker (`marker-prev`) | Shift + ↑ | **Ctrl + ;** | ⌃; | FCP | Shift + ↑ is freed. |
| Next marker (`marker-next`) | Shift + ↓ | **Ctrl + '** | ⌃' | FCP | Shift + ↓ is freed. |

## View

| Action (id) | Old binding | New binding | Final Cut Pro | Status | Notes |
|---|---|---|---|---|---|
| Snapping (`snapping`) | S | **N** | N | FCP | S is freed. |
| Selection mode (`selection-mode`) | Alt + S | **Alt + S** | — | Extension | A second, redundant route to the Select tool (same handler as `interaction-mode-selection`). Inherited from upstream; kept so the action count and any saved user keymaps stay stable. Candidate for removal in a later cleanup. |
| Timeline zoom in (`zoom-in`) | Mod + = / Mod + + | **Mod + = / Mod + Shift + =** | ⌘+ | FCP | The old `Mod + +` alternative was dead: the binding parser splits chords on `+`, so it never produced a key. `Mod + Shift + =` is the same physical chord as ⌘+ and actually matches. |
| Timeline zoom out (`zoom-out`) | Mod + - | **Mod + -** | ⌘- | FCP | |
| Zoom timeline to fit (`zoom-fit`) | Shift + Z | **Shift + Z** | ⇧Z | FCP | Already correct. |
| App UI scale (`useUiScaleShortcuts` — a hook, not a catalog action) | Mod + = / Mod + - / Mod + 0 | **Mod + Alt + = / Mod + Alt + - / Mod + Alt + 0** | — | Extension | Scales the whole interface in 5% steps (clamped 80–150% in the main process); Mod + Alt + 0 resets to 100%. Moved off the bare Mod chords on 2026-09-01 because they are Final Cut's timeline zoom and rule 4 makes Final Cut the law — see conflict 7. Not Mod + Shift + =, which IS ⌘+ on a US layout and is already `zoom-in`'s second binding. Matched on `event.code`, because Option + = prints "≠" on macOS. |
| Fullscreen preview (`fullscreen`) | ` | **Mod + Shift + F / `** | ⇧⌘F ("Play Full Screen") | FCP | FCP's chord added as the primary; the backtick is kept as a one-key alias because it is genuinely convenient and collides with nothing. |
| Keyboard shortcuts (`keyboard-shortcuts`) | Mod + Alt + K | **Mod + Alt + K** | ⌥⌘K (Command Editor) | FCP | Already correct. Works while typing, on purpose. |

## AI

Removed. Aquarius Editor no longer has an in-app chat, so the `ask-ai` action
(Tab) and its **AI** shortcut group are gone; agents drive the editor from
outside over MCP. Tab is free again.

## Modifiers held during a timeline drag

These are not catalog actions (nothing to rebind — they are read straight off the pointer
event), but they are part of the FCP layout and belong in this file.

| Gesture | Modifier | Behaviour | Final Cut Pro | Status |
|---|---|---|---|---|
| Trim a clip edge (either handle, any edit mode) | *none* | **Magnetic trim (the default).** The clip's start frame is anchored; the trim rides on its right edge and every later clip on the affected tracks moves by the same amount. Trimming can never open dead space. | FCP's magnetic timeline ripples trims by default | FCP |
| Trim a clip edge | **Alt** (⌥ Option) | **Non-magnetic escape hatch.** The old behaviour: a left trim moves the clip's left edge and leaves a gap in front of it, a right trim leaves a gap behind it, and nothing downstream moves. | FCP has no single-gesture equivalent (its closest relatives are Position tool edits) | Extension |

The modifier is read **once, at pointer-down**: a drag that starts magnetic stays magnetic even
if Option is pressed or released mid-drag, so a gesture can never change meaning under the hand.
Rate stretch (⌥ is irrelevant there) and slip are unaffected — they have their own geometry.

Implementation: `isMagneticTrim` in `src/components/timeline/trimRipple.ts` is the single
decision point, shared by the commit path (`useTimelinePointer.ts`) and the live drag preview
(`TrackLane.tsx`). Covered by `src/components/timeline/magneticTrim.verify.ts`.

## Conflicts found and how they were resolved

1. **⌥M was double-booked.** The plan moves "add marker and open the dialog" to ⌥M (FCP's
   *Add Marker and Modify*), but ⌥M already deleted the marker at the playhead. Resolved by
   moving delete to **Ctrl + M**, which is FCP's actual *Delete Marker* — a conflict fix that
   also improved parity.
2. **N was still the trim tool when snapping wanted it.** Order matters: trim moved to **T**
   first, which freed N for **snapping**.
3. **X was still "clear marks" when mark-clip wanted it.** Clear marks moved to **⌥X** (FCP)
   and X became **Mark Clip** (FCP).
4. **B was claimed twice.** Blade tool keeps bare **B**; blade-at-playhead is **⌘B**; the old
   ⌘⇧B alias on Paste Effects was dropped so nothing else lives in B's neighbourhood.
5. **⌘M is not available on macOS** (Minimize Window). That is why add-and-modify went to ⌥M
   rather than staying on ⌘M.
6. A machine check now enforces the result: `catalog.verify.ts` fails if any two actions in the
   default preset resolve to the same chord.
7. **Timeline zoom was unreachable from the keyboard, and the check above could not see it.**
   Found on the AquariusOS bench, 2026-09-01. `zoom-in` / `zoom-out` own Mod + = and Mod + -
   here, but `useUiScaleShortcuts` — a global `window` listener that is *not* a catalog action —
   also claimed them and called `preventDefault()` first, so the timeline never zoomed and the
   timeline toolbar's own "Zoom in timeline (⌘＋)" tooltip was untrue. It had been invisible
   since the fork: Electron's default File/Edit menu owned those chords as menu accelerators,
   which are handled before the page sees a key, so *neither* behaviour fired on Linux or
   Windows — removing that menu in v0.7.0 is what let the listener win. Resolved by moving the
   UI-scale accelerators to **Mod + Alt + = / - / 0** (Royce's call: the timeline keeps the
   Final Cut chords, and UI scale has no Final Cut equivalent, so it is the one that moves).
   Note the lesson for conflict 6: `catalog.verify.ts` compares catalog actions against each
   other, so a chord claimed by hand-rolled listener outside the catalog is invisible to it.

## Keys the remap freed

**C, Enter, V, R, S, `/`, ⇧E, ⇧R, ⌘M, ⇧↑, ⇧↓, ⌘⇧B.** They are intentionally left
unassigned. When an FCP command that owns one of these keys gets built (R = Range Selection
tool, S = Skimming), the key is waiting for it — do not spend them on anything else without
updating this file.

**E, W and Q were spent as intended on 2026-09-02**: Append, Insert and Connect, acting on the
selected Library card. See the three rows in the Edit table.

## Matcher changes that the layout required

The FCP layout leans on chords the old matcher could not see. Two fixes in
`src/shortcuts/match.ts` (both covered by `verify:shortcuts`):

1. **Shifted punctuation folds back to the key cap.** macOS reports `<` for ⇧, and `>` for ⇧. —
   a binding written `Shift + ,` would never have matched. Folding is safe because the chord's
   own Shift flag still has to agree, so an unshifted binding can never fire with Shift held.
2. **Physical-key fallback.** On macOS ⌥[ arrives as `“`, ⌥] as `‘`, ⌥M as `µ`. Matching now
   also accepts `KeyboardEvent.code` (the key's position on a US/QWERTY reference layout), so
   every Option chord in this layout works. Without this, ⌥[, ⌥], ⌥X and ⌥M would all be dead
   on the Mac dev bench — and the pre-existing ⌥M and ⌥S bindings already were.

The rebind capture in `keymap.ts` uses the same rules, so pressing ⌥[ in the Shortcuts dialog
records `Alt + [`, not `Alt + “`.

## Field naming (`labelZh`)

Nothing to rename inside `src/shortcuts/**`. Stage 1 already collapsed the shortcut catalog to a
single `label` field holding the English source string, which `t()` localizes like any other UI
copy; the Chinese values live in `src/i18n/dict/zh/ui/catalogs.ts`, keyed by that English string.
The stale `labelZh` fields that remain in the tree are in `src/captions/styles.ts`, which belongs
to a different workstream and is out of scope here.
