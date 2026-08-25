// Runnable check: `npx tsx src/agent/skills/plugin-skills.check.ts` (promoted to .verify.ts, wired to verify:skills).
// Verifies the 26 bundled skills are present + verbatim + parse cleanly. Reads the
// SKILL.md files from disk (not via plugin-skills.ts, which uses Vite `?raw` and can't
// load under tsx) and exercises the pure frontmatter parser on all three source shapes.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSkillFrontmatter } from './skill-frontmatter';

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));  // the check lives alongside the skill content
const EXPECTED = [
  'ai-cinematic-short-film', 'asset-import', 'create-motion-graphics', 'explainer-video',
  'export', 'image-gen', 'known-errors', 'livestream-to-clips', 'long-video-to-shorts',
  'motion-graphic-placement',
  'multi-clips-to-reels', 'music', 'music-intelligence', 'news-rough-cut',
  'openchatcut-plugin-basics', 'product-ad-video-script',
  'product-help', 'shader-gen', 'skill-creator', 'storyboard-shot-breakdown', 'talking-head-guide',
  'transcription', 'verification', 'video-gen', 'video-thumbnail-generator', 'voice',
  'widget-forms',
];

// Every expected skill dir is present, and no extras.
const slugs = readdirSync(SKILLS_DIR).filter((d) => statSync(join(SKILLS_DIR, d)).isDirectory()).sort();
assert.deepStrictEqual(slugs, [...EXPECTED].sort(), 'all 26 bundled skills are present, no more no less');

// Each SKILL.md parses to name(=slug) + non-empty description + substantive verbatim body.
for (const slug of slugs) {
  const raw = readFileSync(join(SKILLS_DIR, slug, 'SKILL.md'), 'utf8');
  const { name, description, body } = parseSkillFrontmatter(raw);
  assert.strictEqual(name, slug, `${slug}: frontmatter name should equal the slug`);
  assert.ok(description.length > 20, `${slug}: description parses to non-empty`);
  assert.ok(body.trim().length > 100, `${slug}: SKILL.md body has substantive content`);
  // Verbatim: the parsed body is a suffix of the original bytes (nothing rewritten).
  assert.ok(raw.endsWith(body), `${slug}: body is a verbatim suffix of the original file (not rewritten)`);
}

// Parser handles all three source description shapes.
const plain = parseSkillFrontmatter('---\nname: a\ndescription: Use when X.\n---\nBODY');
assert.strictEqual(plain.description, 'Use when X.', 'bare-line description');
const quoted = parseSkillFrontmatter('---\nname: b\ndescription: "Use for Y, Z."\n---\nBODY');
assert.strictEqual(quoted.description, 'Use for Y, Z.', 'double-quoted description has quotes stripped');
const block = parseSkillFrontmatter('---\nname: c\ndescription: |\n  Line one\n  line two.\nuser-invocable: true\n---\nBODY');
assert.strictEqual(block.description, 'Line one line two.', '`|` block description is joined and stops at the next key');
assert.strictEqual(block.body, 'BODY', 'block description does not swallow the body');

// A known skill loads a real support file (voice/references/voices.md exists on disk).
const voiceRef = readFileSync(join(SKILLS_DIR, 'voice', 'references', 'voices.md'), 'utf8');
assert.ok(voiceRef.length > 0, 'reference support files travel with the skill too');

console.log(`plugin-skills.check: ok (${slugs.length} skills / 3 frontmatter shapes / references present)`);
