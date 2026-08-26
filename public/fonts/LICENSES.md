# Bundled UI typefaces

These are the three AquariusOS typefaces named in `os-image/branding/tokens.md`.
They ship inside the app so it looks the same on AquariusOS, on a Mac dev
machine, and with no network at all.

Each file is the **latin-subset variable font** as published by Google Fonts —
one file covers every weight the interface asks for, which is why there is no
`-Regular` / `-Bold` pair for any of them.

| File | Family | Role | Version | Licence |
|---|---|---|---|---|
| `Inter-Variable.woff2` | Inter | Body / UI | Google Fonts v20 | SIL Open Font License 1.1 |
| `Sora-Variable.woff2` | Sora | Display / headings | Google Fonts v17 | SIL Open Font License 1.1 |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono | Code, timecode, mono labels | Google Fonts v24 | SIL Open Font License 1.1 |

All three are licensed under the **SIL Open Font License, Version 1.1**. The full
licence text is at <https://openfontlicense.org> and a copy already lives in this
repo at `assets/fonts/OFL-1.1.txt` (bundled there for the Chinese display fonts,
same licence, same terms).

The OFL permits bundling and redistribution inside an application, including a
commercial one, as long as the fonts are not sold on their own and the licence
travels with them — which is what this file is for.

`@font-face` declarations for all three live at the top of `src/index.css`, along
with two compatibility aliases (`Geist`, `Geist Mono`) that point the pre-fork
family names at Inter and JetBrains Mono until the last string literals are
cleaned out of the components.

**Replacing a font:** download the new latin-subset woff2, drop it here, update
the table above, and update the matching `@font-face` block plus the
`--cc-font-*` variables in `src/index.css`. Nothing else references these files.
