import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

interface PublishConfig {
  provider?: string;
  owner?: string;
  repo?: string;
  channel?: string;
}

interface BuilderConfig {
  appId?: string;
  productName?: string;
  artifactName?: string;
  publish?: PublishConfig[] | null;
  mac?: { target?: string[]; icon?: string };
  win?: { icon?: string };
  linux?: { icon?: string; executableName?: string; syncDesktopName?: boolean };
  files?: string[];
}

async function configFor(target: string): Promise<BuilderConfig> {
  // Query isolation is intentional: the config reads CC_EB_TARGET once at module evaluation.
  process.env.CC_EB_TARGET = target;
  const moduleUrl = new URL(`../config/electron-builder.config.mjs?target=${target}`, import.meta.url);
  const loaded = await import(moduleUrl.href) as { default: BuilderConfig };
  return loaded.default;
}

const arm64 = await configFor('darwin-arm64');
// Aquarius Editor is a fork with no release feed. Upstream published to 0xsline/OpenChatCut;
// inheriting that would serve another project's releases as our updates.
assert.equal(arm64.publish, null, 'packaging must not publish to another project\'s release feed');
assert.equal(arm64.appId, 'os.aquarius.editor');
assert.equal(arm64.productName, 'Aquarius Editor');
assert.equal(
  arm64.artifactName,
  'AquariusEditor-${version}-${arch}.${ext}',
  'release file names must stay space-free even though the product name has a space',
);
assert.equal(arm64.mac?.icon, 'assets/branding/aquarius-editor-icon.icns');
assert.deepEqual(arm64.mac?.target, ['dmg', 'zip'], 'macOS updates need a zip artifact in addition to the DMG');
assert.ok(arm64.files?.includes('desktop-dist/native-asr-worker.mjs'));
assert.ok(arm64.files?.includes('desktop-dist/native-semantic-worker.mjs'));
assert.ok(arm64.files?.includes('desktop-dist/native-clap-worker.mjs'));
assert.ok(arm64.files?.includes('desktop-dist/native-rhythm-worker.mjs'));
assert.equal(
  arm64.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64/**'),
  false,
  'the target ONNX Runtime binary must remain packaged',
);
assert.ok(
  arm64.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/win32/x64/**'),
  'foreign ONNX Runtime binaries must be excluded',
);

const x64 = await configFor('darwin-x64');
assert.equal(x64.publish, null);
assert.equal(
  x64.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/darwin/x64/**'),
  false,
  'x64 packages must retain the x64 ONNX Runtime binary',
);

const linux = await configFor('linux-x64');
assert.equal(linux.linux?.executableName, 'aquarius-editor', 'the Linux binary keeps the fork\'s own name');
assert.equal(linux.linux?.icon, 'assets/branding/icons');
assert.equal(linux.linux?.syncDesktopName, true, 'the window must match aquarius-editor.desktop');
for (const worker of ['asr', 'semantic', 'clap', 'rhythm']) {
  assert.ok(
    linux.files?.includes(`desktop-dist/native-${worker}-worker.mjs`),
    `Linux packages must ship the native ${worker} worker`,
  );
}
assert.equal(
  linux.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**'),
  false,
  'Linux packages must retain the target ONNX Runtime binary',
);
assert.ok(
  linux.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/win32/x64/**'),
  'Linux packages must exclude foreign ONNX Runtime binaries',
);
assert.equal(
  linux.files?.includes('!node_modules/sqlite-vec-linux-x64/**'),
  false,
  'Linux x64 packages must retain sqlite-vec-linux-x64',
);
for (const foreignPackage of [
  'darwin-arm64',
  'darwin-x64',
  'windows-x64',
  'linux-arm64',
]) {
  assert.ok(
    linux.files?.includes(`!node_modules/sqlite-vec-${foreignPackage}/**`),
    `Linux x64 packages must exclude sqlite-vec-${foreignPackage}`,
  );
}

const linuxArm64 = await configFor('linux-arm64');
assert.equal(
  linuxArm64.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**'),
  false,
  'Linux arm64 packages must retain the arm64 ONNX Runtime binary',
);

const windows = await configFor('win32-x64');
assert.equal(windows.win?.icon, 'assets/branding/aquarius-editor-icon.ico');
assert.equal(
  windows.files?.includes('!node_modules/sqlite-vec-windows-x64/**'),
  false,
  'Windows packages must map win32-x64 to sqlite-vec-windows-x64',
);
assert.ok(
  windows.files?.includes('!node_modules/sqlite-vec-linux-x64/**'),
  'Windows packages must exclude foreign sqlite-vec extensions',
);

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  desktopName: string;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};
assert.equal(packageJson.name, 'aquarius-editor');
assert.equal(
  packageJson.desktopName,
  'aquarius-editor.desktop',
  'the Linux desktop entry must match linux.executableName so the window binds to its launcher',
);
assert.equal(
  packageJson.devDependencies['electron-builder'],
  '26.15.7',
  'Windows NSIS packaging must retain the BCJ extraction fix shipped in electron-builder 26.15.6+',
);
assert.match(
  packageJson.scripts['desktop:build:main'],
  /native-rhythm-worker\.ts.*native-rhythm-worker\.mjs/,
  'desktop build must bundle the native rhythm utility process',
);
assert.match(packageJson.scripts['desktop:dist'], /--mac --arm64/, 'arm64 packaging must build every configured mac target');
assert.match(packageJson.scripts['desktop:dist:mac-x64'], /--mac --x64/, 'x64 packaging must build every configured mac target');
assert.doesNotMatch(packageJson.scripts['desktop:dist'], /--mac dmg/, 'mac packaging must not suppress update zip metadata');
const windowsDistScript = packageJson.scripts['desktop:dist:win'];
assert.match(
  windowsDistScript,
  /spawnSync\(process\.execPath,\['node_modules\/electron-builder\/cli\.js'/,
  'Windows packaging must launch electron-builder through a cross-platform Node wrapper',
);
assert.match(
  windowsDistScript,
  /env:\{\.\.\.process\.env,CC_EB_TARGET:'win32-x64'\}/,
  'Windows packaging must explicitly select win32-x64 filters on every host',
);
assert.doesNotMatch(
  windowsDistScript,
  /&& electron-builder /,
  'Windows packaging must not invoke electron-builder with host-derived filters',
);
assert.match(
  windowsDistScript,
  /'--config','config\/electron-builder\.config\.mjs'/,
  'Windows packaging must pass the categorized electron-builder config path',
);
assert.match(
  packageJson.scripts['desktop:dist'],
  /--config config\/electron-builder\.config\.mjs/,
  'macOS packaging must pass the categorized electron-builder config path',
);
assert.match(
  packageJson.scripts['desktop:dist:linux'],
  /--config config\/electron-builder\.config\.mjs/,
  'Linux packaging must pass the categorized electron-builder config path',
);

const workflow = await readFile(new URL('../.github/workflows/desktop.yml', import.meta.url), 'utf8');
// With no publish provider electron-builder emits no auto-update metadata, so the workflow
// must not ask for latest-*.yml or *.blockmap files that will never exist. Re-add all of
// them together with `publish` when Aquarius Editor has a release feed.
assert.doesNotMatch(workflow, /latest-(arm64|x64)(-mac|-linux)?\.yml/, 'no update metadata without a release feed');
assert.doesNotMatch(workflow, /\.blockmap/, 'no differential update metadata without a release feed');
assert.match(workflow, /EXPECTED_VERSION="\$\{GITHUB_REF_NAME#v\}"/, 'release gate must derive its package version');
assert.match(workflow, /-name '\*\.zip'.* = 2/, 'release aggregation must retain both macOS archives');
for (const arch of ['arm64', 'x64']) {
  assert.ok(
    workflow.includes(`release-files/AquariusEditor-\${EXPECTED_VERSION}-${arch}.dmg`),
    `release gate must require the ${arch} DMG under the fork's artifact name`,
  );
}
assert.match(workflow, /release-files\/\*/, 'GitHub Release must publish every built installer together');

assert.doesNotMatch(
  workflow,
  /find release -type d -name '?Aquarius Editor\.app'?|(?:mac|win|linux)-unpacked\b/,
  'desktop smoke tests must never launch unpacked electron-builder output',
);
assert.equal(
  workflow.match(/CC_SMOKE: '1'/g)?.length,
  3,
  'every shipped desktop artifact must run the application smoke contract',
);
assert.equal(
  workflow.match(/CC_SMOKE_RENDER: '1'/g)?.length,
  3,
  'every shipped desktop artifact must run the render smoke contract',
);
assert.match(
  workflow,
  /Smoke test Windows installer[\s\S]*?CC_SMOKE_MCP_RECOVERY: '1'[\s\S]*?Start-Process -FilePath \$installedExe/,
  'the installed Windows application must exercise MCP checkpoint recovery',
);
assert.match(workflow, /hdiutil attach[\s\S]*?"\$\{dmgs\[0\]\}"/, 'macOS smoke must mount the generated DMG');
assert.match(
  workflow,
  /"\$mounted_app\/Contents\/MacOS\/Aquarius Editor"/,
  'macOS smoke must launch the app from the mounted DMG',
);
assert.match(workflow, /unzip -tq "\$\{zips\[0\]\}"/, 'macOS smoke must validate the generated update ZIP');
assert.match(
  workflow,
  /Aquarius Editor\.app\/Contents\/MacOS\/Aquarius Editor/,
  'macOS update ZIP must contain the application executable',
);
assert.match(
  workflow,
  /Aquarius Editor\.app\/Contents\/Frameworks\/Electron Framework\.framework\/Versions\/A\/Electron Framework/,
  'macOS update ZIP must contain the Electron runtime',
);
assert.match(
  workflow,
  /render_runtime="Aquarius Editor\.app\/Contents\/Resources\/chrome-headless-shell\//,
  'macOS update ZIP must contain the packaged render runtime',
);
assert.match(
  workflow,
  /Get-ChildItem -LiteralPath release -Filter '\*\.exe' -File/,
  'Windows smoke must select the generated NSIS installer',
);
assert.match(
  workflow,
  /ArgumentList @\('\/S', "\/D=\$installDir"\)/,
  'Windows smoke must silently install NSIS into an isolated path',
);
assert.match(
  workflow,
  /Start-Process -FilePath \$installedExe -Wait -PassThru/,
  'Windows smoke must launch the installed executable',
);
assert.match(
  workflow,
  /Get-ChildItem -LiteralPath \$installDir -Filter 'Uninstall\*\.exe' -File/,
  'Windows smoke must run the generated uninstaller',
);
assert.match(
  workflow,
  /xvfb-run --auto-servernum "\$\{appimages\[0\]\}" --appimage-extract-and-run/,
  'Linux smoke must execute the generated AppImage without relying on FUSE',
);
for (const smokeName of [
  'Smoke test macOS distribution',
  'Smoke test Windows installer',
  'Smoke test Linux AppImage',
]) {
  const smokeIndex = workflow.indexOf(`- name: ${smokeName}`);
  const artifactIndex = workflow.indexOf('- uses: actions/upload-artifact@v7');
  assert.ok(smokeIndex >= 0 && smokeIndex < artifactIndex, `${smokeName} must gate artifact publication`);
}

const draftIndex = workflow.indexOf('- name: Create or reuse draft release');
const uploadIndex = workflow.indexOf('- name: Upload and verify release assets');
const publishIndex = workflow.indexOf('- name: Publish verified draft');
assert.ok(
  draftIndex >= 0 && draftIndex < uploadIndex && uploadIndex < publishIndex,
  'release workflow must create a draft, verify uploaded assets, then publish in that order',
);
assert.match(
  workflow,
  /gh release create[\s\S]*?--draft; then/,
  'new GitHub Releases must begin as drafts',
);
assert.match(
  workflow,
  /if \[\[ "\$is_draft" != "true" \]\]; then[\s\S]*?already public/,
  'release retries must reject an existing public release',
);
assert.match(
  workflow,
  /gh release upload[\s\S]*?release-files\/\*[\s\S]*?--clobber; then/,
  'draft retries must replace partial or stale copies of expected assets',
);
assert.match(workflow, /sha256sum "\$asset"/, 'release verification must hash each local asset');
assert.match(
  workflow,
  /gh release view "\$GITHUB_REF_NAME"[\s\S]*?--json isDraft,assets/,
  'draft asset verification must use the release command that can read draft releases',
);
assert.match(
  workflow,
  /\.assets\[\] \| \[\.name, \(\.digest \/\/ ""\)\]/,
  'release verification must read back every remote asset name and digest',
);
assert.match(
  workflow,
  /cmp -s "\$local_manifest" "\$remote_manifest"/,
  'remote asset names and SHA-256 digests must exactly match the local manifest',
);
assert.ok(
  workflow.indexOf('--draft=false') > publishIndex,
  'the verified draft must be published only in the final release step',
);

console.log('update-packaging.verify: fork identity, icons, disabled release feed, and packaging contract OK');
