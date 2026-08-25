# News Rough Cut — Deterministic Execution Template and Acceptance Checklist

> OpenChatCut-native reference. Borrows the common approach used by industry deterministic-editing workflows (environment check → source parsing → generate one deterministic edit plan → execute once → mandatory acceptance check).
> Complies with this skill's SKILL.md rules: stay faithful to the original footage, add no external sound, cut speech along complete semantic boundaries, and keep a news-objective, restrained style.

## I. Execution order (fixed sequence, do not skip steps)

1. **Environment and source check (mandatory, up front)**
   - Use `read_project` / `read_timeline` to confirm the current project and timeline exist and contain the target source clips.
   - Build an allow-list of sources: record only the `sourceAssetId` and `src` of the news footage and its original sync sound that the user explicitly specified or selected; when nothing is explicitly specified, include only the news footage and sync sound already present on the active timeline. BGM, SFX, voiceover, narration, and any other unselected assets in the media pool are never included.
   - Use `transcribe_track` to get a word-level transcript; if a track cannot be transcribed, resolve source accessibility first before continuing.
   - Use `view_timeline_frames` to check key frames against the source content.
   - If the pre-check fails → stop and report what's missing; do not pretend the task is done.

2. **Source parsing and topic determination**
   - Identify: the news event / core topic / key people / important conclusions / usable footage.
   - Decide how many topics: one finished cut stays focused on a single core news thread; when multiple topics are present, pick the one with the highest news value, the most complete information, and the most adequate footage.
   - Determine the maximum length of the finished cut (driven by the amount of information and the usable speech length, not a rigid fixed value).

3. **Generate the edit plan (plan first, then execute)**
   - Produce **one explicit edit plan** following "keep / cut" rules: which segments to keep (with sentence boundaries), which verbal tics / repetitions / ads to cut, and which cut points to fine-tune.
   - Principle: lead with the conclusion / latest development / key footage; only cut speech at the end of a complete sentence, a natural pause, an obvious turn, or a shot transition.
   - This step produces a "deterministic plan" — it is not meant to have the user sign off at every step; the plan is finalized in one pass.

4. **Execute in one pass**
   - Use `edit_item`'s batch update/delete to apply trims, ripple deletes, and fades; call `split_item` when a clip needs to be split.
   - Speech cuts must land on complete sentence boundaries (guaranteed by the word-level transcript).
   - **Add nothing new**: no BGM / narration / sound effects / transition sounds; do not add any `video` / `audio` from the media pool outside the source allow-list, even if that asset already existed before editing.

5. **Final acceptance check (mandatory, see below)**
   - Call `read_project` again and compare every final `video` / `audio`'s `sourceAssetId` / `src` against the source allow-list item by item; a trim, split, or move on the same allowed source is legal — any unselected source (including audio carried in by an added video) is not.
   - Play back segment by segment to verify: factual fidelity, complete speech semantics, natural cut-point continuity, and no pops or abrupt cutoffs.

## II. Mandatory acceptance checklist (every finished cut must pass, item by item)

| Check item | Pass criterion | If it fails |
|---|---|---|
| Project exists and is readable | `read_project` successfully returns the current active project | Stop, report why the project could not be read |
| At least 1 video track clip | Kept footage clips exist on the timeline | State that there is no usable footage; the cut is not finished |
| Cut length matches the amount of information | No irrelevant content was padded in just to hit a length; no speech or key facts were cut just to shorten it | Rebalance length against content |
| Opens directly with the core point | The opening segment is the conclusion / latest development / key footage, with no long windup | Adjust the opening |
| Speech semantics are complete | Every kept speech segment can independently express a complete idea, with no "cut off mid-sentence" | Fix the cut points |
| No external sound | Every final `video` / `audio` belongs to the user-selected news footage / original sync-sound allow-list; BGM, SFX, voiceover, or narration that existed in the media pool but was not selected must not be used | Remove the unselected-source segment and re-run acceptance |
| Cut-point continuity | No abrupt cutoffs, overlaps, or obvious volume jumps; fine-tune with fadeInSeconds/fadeOutSeconds | Add a 1-2 frame fade in/out |
| Facts and logic | Original meaning is not changed, not exaggerated or downplayed, no incorrect associations, no speculation presented as fact, no mismatched footage | Roll back to the original source and re-cut |

## III. Mapping to SKILL.md tools

- `read_project` / `read_timeline`, `transcribe_track`, `view_timeline_frames`, `edit_item` (trim / ripple delete / fade), `split_item`, `edit_track`.
- The "no added audio" check in acceptance must be verified by comparing the source allow-list established at the start against the final `read_project` result — the whole media pool cannot be used as the baseline, and it cannot be judged by counting audio-track clips.

## IV. Failure recovery

- Any failed acceptance item → roll back to the "generate edit plan" step and re-plan (not from scratch — locate the step that violated the rule).
- If the timeline is left broken, it is fine to use the project's undo/history to return to the pre-execution state and re-run.
- Only after every acceptance item passes should you report the cut as "finished," along with reviewable results such as final duration, number of kept segments, and number of cut points.
