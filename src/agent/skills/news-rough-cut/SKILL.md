---
name: news-rough-cut
description: Smart news rough cut — turn news footage into a content-complete, logically clear, tightly paced news short. Use when the user asks to rough-cut news, edit news footage, cut news material into a short video, smart rough cut, news rough cut, edit news video, or provides news footage (press conference/interview/on-scene/surveillance footage) to be cut into a factual news short. Never add music, voiceover, or sound effects.
---

# News Rough Cut

Turn news footage into a content-complete, logically clear, tightly paced news short. Stay faithful to the source footage, add no external sound, and keep an objective, formal, tight, clear informational news style.

This is an OpenChatCut-native workflow. Use the current project's assets, transcript, word-level editing, timeline, and editing tools. Do not depend on external download or transcode pipelines.

## Workflow overview

1. **Fully analyze the footage first** (mandatory before cutting): identify the news event, core topic, key people, important conclusions, and usable shots in the footage, then decide the editorial through-line and final runtime. Use `read_project`, `transcribe_track`, and `view_timeline_frames` to check the footage segment by segment.
2. **Topic analysis and runtime decision**: determine how many topics the footage covers, and separate the core topic from secondary material.
3. **Content organization**: lead with the most important news result/core conclusion/latest development/key on-scene footage — no throat-clearing.
4. **Execute the cut**: filter by the keep/cut rules, and split speech along complete semantic units.
5. **Audio keeps only the target news footage's original sound**: before editing, only the news footage the user has explicitly specified/selected, and its original on-scene sound, count as allowed sources; when nothing is explicitly specified, use only the news footage and on-scene sound already present on the active timeline. BGM, sound effects, voiceover, narration, and any other unselected assets in the media pool are never allowed sources, even if they already exist in the project.
6. **Final check**: play back segment by segment to confirm factual fidelity, complete speech semantics, and natural cut-point continuity.

## Topic analysis and runtime decision

- In principle, a finished cut should build around **one core news through-line**.
- If the footage contains multiple independent topics, prioritize the topic with **the highest news value, the most complete information, and the most adequate footage**; **do not force unrelated topics together** into one video.
- The runtime is not fixed; determine it automatically from:
  - how much information the core news carries;
  - the length of usable speech from relevant people;
  - the event's stage of development and latest progress;
  - the number of key on-scene shots;
  - the runtime needed to keep the news semantically complete.
- When there is little information, **shorten the cut** rather than padding it with unrelated content; when there is a lot, extend it moderately — **never cut off someone's speech, drop key facts, or break the news logic just to compress the runtime**.

## Content organization logic

Lead the cut with the most important news result, core conclusion, latest development, or key on-scene footage — no long windup. Organize the whole piece along this logic:

1. what happened;
2. the latest developments so far;
3. the final result, follow-on impact, or related response.

If the news event has not concluded, end on **the latest confirmed development** — never speculate about the outcome.

## Content-retention rules

Prioritize keeping:

- the core facts of the news event;
- time, place, people, and the outcome of the event;
- the latest developments and authoritative responses;
- speech from key people that carries real information;
- news scenes, interviews, press conferences, surveillance footage, and other relevant usable material;
- key shots that directly convey the event's course, outcome, or impact.

Everything retained must serve the core news through-line.

## Content-removal rules

Remove:

- ads and commercial promotion;
- show promos, channel packaging, and intros/outros;
- host small talk and low-information filler;
- repeated statements and repeated shots;
- dead pauses, filler words, and obvious blank stretches;
- long background unrelated to the core event;
- secondary content that doesn't affect understanding of the news;
- unverifiable, ambiguous, or misleading fragments.

## Speech-editing rules

- A person's speech must stay **semantically complete**.
- Prefer cutting at:
  - the end of a complete sentence;
  - a natural pause in speech;
  - a clear turn in what's being said;
  - a natural shot transition.
- **Never** cut off a sentence mid-way, **never** keep only part of a statement in a way that changes its meaning, and **never** splice together speech from different times or contexts as if it were continuous.
- If a piece of speech is long, you may remove repetitive, vague, or irrelevant sentences from it, but whatever remains must **stand on its own as a complete thought**.
- Use word-level editing tools (the transcript) to trim word by word, and make sure cut points land on complete sentence boundaries.

## Factual and logical requirements

The cut must stay faithful to the original news footage. Do not:

- change the original meaning of anyone's speech;
- exaggerate or downplay facts;
- wrongly connect unrelated events;
- create a false cause-and-effect relationship through shot splicing;
- present speculative content as established fact;
- use footage that doesn't match the news event in a way that misleads viewers;
- cut necessary cause-and-effect just to chase pacing.

## Audio requirements

- **Do not add** any background music, voiceover, narration, sound effects, transition sounds, or other external audio.
- Keep only the original speech and necessary on-scene sound directly relevant to the news content from the source footage.
- Remove ad music, show-packaging music, and any sound unrelated to the core news.
- When handling cut points, keep the original speech connected naturally, avoiding abrupt cutoffs, overlaps, pops, or obvious volume jumps (use `edit_item`'s fadeInSeconds/fadeOutSeconds to fine-tune cut points — no need to add music).

## Overall style

- An objective, formal, tight, clear informational news style.
- Let the news content dictate the pacing — don't force a fixed runtime or high-frequency cuts.
- Make sure every retained segment carries clear informational value, maximizing information density while keeping content complete.
- No text overlays/filters/transition effects; a basic cross-dissolve to avoid a hard cut is fine, but stay restrained, as news should.

## OpenChatCut tool mapping

- `read_project` / `read_timeline`: read the project and timeline state first, and record the allowed sources' `sourceAssetId` and `src` per the scope above; never auto-include the entire media pool.
- `transcribe_track` + word-level transcript editing: cut speech along complete semantic units, remove filler words/repetition.
- `view_timeline_frames`: check shot content and key on-scene moments.
- `edit_item` (trim / ripple delete / fade) and `split_item` (split): cut per the keep/remove rules and handle cut-point continuity.
- `edit_track`: create, adjust, or tighten up voice tracks and on-scene-sound tracks when multi-track organization is needed.
- Before output, `read_project` again to confirm every final `video`/`audio` item comes from an allowed source and that there is no added BGM, sound effects, voiceover, or narration, then check runtime and content completeness with a preview/export preflight.

## Reference files

- When executing the final cut, follow the fixed, deterministic process and mandatory acceptance checklist in [references/deterministic-execution-and-acceptance.md](references/deterministic-execution-and-acceptance.md): environment check → footage analysis → produce a single edit plan → execute it once → item-by-item final acceptance check (at least 1 video-track segment, no external audio added to the finished cut, speech stays semantically complete, cut points connect naturally).
