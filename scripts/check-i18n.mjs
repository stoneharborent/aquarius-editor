// i18n guard for an English-source codebase.
//
// English is the source language: `t('English copy')` uses the English string itself as the key,
// and every other locale is a dictionary keyed by that English string. Two things therefore have
// to stay true, and this script enforces both:
//
//   1. No CJK text anywhere under src/ except inside the Chinese dictionary (src/i18n/dict/zh/).
//      That is the whole point of the conversion — Chinese lives in the translation target, not
//      in the source.
//   2. Every literal `t('…')` key has a Chinese translation, so switching to zh never drops a
//      string back to English silently. Dynamic keys (`t(variable)`) cannot be checked here; the
//      data constants they read from are plain literals and are covered by the same rule wherever
//      they are declared.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(ROOT, 'src');
const DICT_ROOT = path.join(SOURCE_ROOT, 'i18n', 'dict');
const ZH_DICT_ROOT = path.join(DICT_ROOT, 'zh');
const CJK = /[\u3400-\u9fff]/;

// Chinese-language *data* the runtime needs (segmenter word lists, agent keyword lists, CJK font
// aliases, per-locale copy tables) lives with the zh dictionary, so no production source file is
// allowed to hold Chinese text.
//
// The exception below is tests. Every file here exists *because* it exercises CJK text handling —
// caption segmentation and pagination, CJK paragraph joining, SQLite FTS5 Chinese search, CJK
// filenames through import/export/transfer, multi-byte token budgets, CJK font resolution, or the
// zh locale itself. Their Chinese content is the fixture under test; translating it away would
// delete the coverage. Nothing but a test belongs on this list.
const ALLOW_CJK_FILES = new Set([
  'src/agent/ai-sdk.verify.ts',
  'src/agent/codex/runtime.verify.ts',
  'src/agent/context-compaction.verify.ts',
  'src/agent/harness-context-checkpoint.verify-helper.ts',
  'src/agent/harness-context.verify.ts',
  'src/agent/selection-refs.verify.ts',
  'src/agent/tool-result-compaction.verify.ts',
  'src/agent/tools/followup-tools.verify.ts',
  'src/agent/tools/font-tools.verify.ts',
  'src/agent/tools/search-tools.verify.ts',
  'src/agent/tools/stock-tools.verify.ts',
  'src/agent/tools/transcript-tools.verify.ts',
  'src/agent/tools/upload-tools.verify-import.ts',
  'src/agent/useServerRun.verify.ts',
  'src/captions/captionPagination.verify.ts',
  'src/captions/exportCaptions.verify.ts',
  'src/captions/segmenter.verify.ts',
  'src/export/fcpxml.verify.ts',
  'src/fonts/notoSansOffline.verify.ts',
  'src/media/searchMedia.verify.ts',
  'src/media/transcriptParagraphs.verify.ts',
  'src/persist/mediaCleanup.verify.ts',
  'src/persist/migrations/migrations.verify.source-metadata.ts',
  'src/persist/projectTransfer.verify.ts',
  'src/transcript/assemblyai-resume.verify.ts',
  'src/transcript/phrases.verify.ts',
  'src/transcript/variants.verify.ts',
]);

function relativeSourcePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function sourceFile(filePath) {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function unwrapExpression(node) {
  if (
    ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node)
    || ts.isParenthesizedExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
}

/** Every key of the generated Chinese dictionary (UI shards + data tables). */
function chineseKeys() {
  const keys = new Set();
  for (const filePath of walk(ZH_DICT_ROOT).filter((file) => file.endsWith('.ts') && !file.endsWith('index.ts'))) {
    const sf = sourceFile(filePath);
    const objects = [];
    for (const statement of sf.statements) {
      if (ts.isExportAssignment(statement)) objects.push(unwrapExpression(statement.expression));
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (declaration.initializer) objects.push(unwrapExpression(declaration.initializer));
        }
      }
    }
    for (const object of objects) {
      if (!ts.isObjectLiteralExpression(object)) continue;
      for (const property of object.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (ts.isStringLiteralLike(property.name)) keys.add(property.name.text);
        else if (ts.isIdentifier(property.name)) keys.add(property.name.text);
      }
    }
  }
  return keys;
}

function issue(sf, node, message) {
  const relative = relativeSourcePath(sf.fileName);
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${relative}:${line + 1}:${character + 1} ${message}`;
}

const keys = chineseKeys();
const sourceFiles = walk(SOURCE_ROOT).filter((filePath) => {
  if (!/\.tsx?$/.test(filePath)) return false;
  return !filePath.startsWith(DICT_ROOT);
});

const issues = [];
let translatedCalls = 0;
for (const filePath of sourceFiles) {
  const relative = relativeSourcePath(filePath);
  const sf = sourceFile(filePath);
  const allowCjk = ALLOW_CJK_FILES.has(relative);
  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 't'
      && node.arguments[0]
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      translatedCalls += 1;
      const key = node.arguments[0].text;
      if (!keys.has(key)) {
        issues.push(issue(sf, node.arguments[0], `Chinese dictionary is missing: ${JSON.stringify(key)}`));
      }
    }
    if (!allowCjk) {
      if (ts.isJsxText(node) && CJK.test(node.text.trim())) {
        issues.push(issue(sf, node, `Chinese rendered directly: ${JSON.stringify(node.text.trim())}`));
      }
      const text = ts.isStringLiteralLike(node) ? node.text
        : (node.kind === ts.SyntaxKind.TemplateHead
          || node.kind === ts.SyntaxKind.TemplateMiddle
          || node.kind === ts.SyntaxKind.TemplateTail) ? node.text : null;
      if (text && CJK.test(text)) {
        issues.push(issue(sf, node, `Chinese literal in source (English is the source language): ${JSON.stringify(text)}`));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!allowCjk) {
    for (const comment of fs.readFileSync(filePath, 'utf8').split('\n').entries()) {
      const [index, line] = comment;
      const stripped = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
      if (/(^|\s)(\/\/|\*|\/\*)/.test(stripped) && CJK.test(stripped)) {
        issues.push(`${relative}:${index + 1} Chinese comment (English is the source language)`);
      }
    }
  }
}

if (issues.length > 0) {
  console.error(`i18n check failed (${issues.length} issues):`);
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log(`i18n check passed: ${sourceFiles.length} source files, ${translatedCalls} t() call sites, ${keys.size} Chinese dictionary entries`);
