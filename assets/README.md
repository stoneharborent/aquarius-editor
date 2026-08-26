# Product assets (built-in static files)

Files the product ships with, released as part of every version. These are **not** user
uploads or AI-generated project media.

| Folder / file | URL prefix | What it is |
|---|---|---|
| `branding/` | — | App icons + `render-icons.mjs`, which generates them from the AquariusOS logo. Not served over HTTP. |
| `fonts/` | `/fonts/` | Bundled CJK / display fonts, as woff2 |
| `thumbnails/` | `/thumbnails/` | Motion-graphics template library thumbnails |
| `voice-samples/` | `/voice-samples/` | Text-to-speech voice previews |
| `sound-effects/` | `/sound-effects/` | The sound-effects library |
| `audio/` | `/audio/` | Built-in sample audio tracks |
| `media/` | `/media/` | Sample media shipped with the product (e.g. speech-sample). **Excludes** uploads. |
| `luts/` | `/luts/` | `.cube` colour LUTs |
| `library-previews/` | `/library-previews/` | Preview images for the resource library |
| `plugins/` | `/plugins/` | Built-in plugin index and examples |
| `templates/` | `/templates/` | Motion-graphics / voiceover template JSON (imported at compile time) |
| `vendor-icons/` | `/vendor-icons/` | Vendor SVGs used on the settings page (imported at compile time) |
| `favicon.svg` / `icons.svg` | `/` | Site icons |

## How this differs from `public/`

- **`assets/`** (this folder) → ships with the product, and is committed to git.
- **`public/media/uploads/`** → user uploads, AI-generated files, and export intermediates
  only. Ignored by git by default.

`server/product-assets.ts` (a Vite plugin) mounts this folder at the site root during both
development and build; Remotion exports overlay the same folder. The URLs are unchanged from
before these files moved out of `public/`.

## The app icons

`branding/aquarius-editor-icon.icns`, `branding/aquarius-editor-icon.ico`, `branding/icons/*.png`
and `../public/aquarius-editor-icon.png` are **generated files**. Never edit them by hand —
change `../../os-image/branding/logo.svg` instead and re-run:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node assets/branding/render-icons.mjs
```
