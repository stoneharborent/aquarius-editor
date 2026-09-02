import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CHECKSUM_ASSET_NAME,
  RELEASE_API_LATEST,
  RELEASE_DOWNLOAD_BASE,
  overlayReleaseAssets,
} from './overlay-update';
import { builtinLlmModel } from '../shared/llm-model-catalog';

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
  mac?: { target?: string[]; icon?: string; signIgnore?: string[] };
  win?: { icon?: string; target?: string[] };
  linux?: { icon?: string; executableName?: string; syncDesktopName?: boolean };
  files?: string[];
  extraResources?: { from: string; to: string; filter?: string[] }[];
}

async function configFor(target: string): Promise<BuilderConfig> {
  // Query isolation is intentional: the config reads CC_EB_TARGET once at module evaluation.
  process.env.CC_EB_TARGET = target;
  const moduleUrl = new URL(`../config/electron-builder.config.mjs?target=${target}`, import.meta.url);
  const loaded = await import(moduleUrl.href) as { default: BuilderConfig };
  return loaded.default;
}

const arm64 = await configFor('darwin-arm64');
// The feed is Aquarius Editor's own repository and nothing else. Upstream published to
// 0xsline/OpenChatCut; inheriting that would serve another project's releases as our updates.
assert.deepEqual(
  arm64.publish,
  [{ provider: 'github', owner: 'stoneharborent', repo: 'aquarius-editor', channel: 'latest-arm64' }],
  'packaging must publish to the fork\'s own release feed',
);
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
assert.ok(
  arm64.files?.includes('desktop-dist/builtin-llm-worker.mjs'),
  'the installer must ship the worker that hosts the bundled HyperFrames model',
);
// The server resolves that worker as a sibling of the bundle it was built into,
// so both must be packaged from the same folder. Shipping the worker anywhere
// else brought back "the built-in model process exited with code 1".
assert.equal(
  arm64.files?.includes('desktop-dist/main.mjs'),
  true,
  'the main bundle must ship from desktop-dist, next to the built-in model worker',
);
// node-llama-cpp ships one prebuilt llama.cpp package per platform/backend and
// they are tens of megabytes each. Keep this artifact's, drop the rest.
assert.equal(
  arm64.files?.includes('!node_modules/@node-llama-cpp/mac-arm64-metal/**'),
  false,
  'the arm64 macOS package must retain the Metal llama.cpp binary',
);
for (const foreign of ['mac-x64', 'win-x64-cuda', 'linux-x64-vulkan', 'linux-arm64']) {
  assert.ok(
    arm64.files?.includes(`!node_modules/@node-llama-cpp/${foreign}/**`),
    `foreign llama.cpp binaries (${foreign}) must be excluded`,
  );
}
assert.equal(
  arm64.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64/**'),
  false,
  'the target ONNX Runtime binary must remain packaged',
);
assert.ok(
  arm64.files?.includes('!node_modules/onnxruntime-node/bin/napi-v6/win32/x64/**'),
  'foreign ONNX Runtime binaries must be excluded',
);

// The bundled ONNX weights are inert data. Signing them individually gains nothing and,
// before this was pinned, packaging died on them outright (see the isbinaryfile override
// asserted further down). Both halves are load-bearing and must stay in sync: signIgnore
// matches the resources path that extraResources writes.
const bundledModelsResource = arm64.extraResources
  ?.find((resource) => resource.to === 'bundled-models');
assert.ok(
  bundledModelsResource,
  'the installer must still stage the pre-installed local models into resources/bundled-models',
);
assert.equal(bundledModelsResource?.from, 'desktop-dist/bundled-models');
assert.deepEqual(
  arm64.mac?.signIgnore,
  ['/Contents/Resources/bundled-models/'],
  'arm64 macOS signing must skip the bundled model weights',
);
// electron-builder compiles each entry to a RegExp and tests it against the absolute path,
// so assert against a path shaped exactly like the one the packaged app ends up with.
const packagedModelPaths = [
  `/tmp/Aquarius Editor.app/Contents/Resources/${bundledModelsResource!.to}`
    + '/Xenova/whisper-small/onnx/decoder_model_merged_quantized.onnx',
  // The language model does not ship any more (it does not fit — see
  // shared/bundled-models.ts), but the rule that covers it has to keep holding
  // for whatever is staged under bundled-models/ next: inert weights nothing
  // dlopen()s, covered only because the cachePath starts under that directory.
  `/tmp/Aquarius Editor.app/Contents/Resources/${bundledModelsResource!.to}`
    + `/${builtinLlmModel().file.cachePath}`,
];
for (const packagedModelPath of packagedModelPaths) {
  for (const pattern of arm64.mac?.signIgnore ?? []) {
    assert.match(
      packagedModelPath,
      new RegExp(pattern),
      'signIgnore must match the path extraResources actually writes the models to',
    );
  }
}
// The llama.cpp binary itself is loadable Mach-O and MUST still be signed —
// signIgnore covers the weights, never the code that reads them.
assert.doesNotMatch(
  '/tmp/Aquarius Editor.app/Contents/Resources/app/node_modules/@node-llama-cpp/mac-arm64-metal/llama-addon.node',
  new RegExp(arm64.mac!.signIgnore!.join('|')),
  'signIgnore must never swallow the native llama.cpp addon',
);
assert.doesNotMatch(
  '/tmp/Aquarius Editor.app/Contents/MacOS/Aquarius Editor',
  new RegExp(arm64.mac!.signIgnore!.join('|')),
  'signIgnore must never swallow the application binaries themselves',
);

const x64 = await configFor('darwin-x64');
assert.deepEqual(
  x64.mac?.signIgnore,
  arm64.mac?.signIgnore,
  'both macOS architectures must skip the same unsignable payload',
);
// One channel per architecture: a shared latest.yml would let an x64 build offer an arm64
// download (and the other way round) for the same version.
assert.equal(x64.publish?.[0]?.channel, 'latest-x64');
assert.notEqual(arm64.publish?.[0]?.channel, x64.publish?.[0]?.channel);
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
assert.ok(
  linux.files?.includes('desktop-dist/builtin-llm-worker.mjs'),
  'Linux packages must ship the built-in LLM worker — AquariusOS is the primary target',
);
// Which llama.cpp backend loads is decided at runtime from the machine's
// hardware, so a Linux x64 build carries the CPU, CUDA and Vulkan packages and
// drops every other platform's.
for (const kept of ['linux-x64', 'linux-x64-cuda', 'linux-x64-vulkan']) {
  assert.equal(
    linux.files?.includes(`!node_modules/@node-llama-cpp/${kept}/**`),
    false,
    `Linux x64 packages must retain the ${kept} llama.cpp binary`,
  );
}
for (const foreign of ['mac-arm64-metal', 'win-x64', 'linux-arm64']) {
  assert.ok(
    linux.files?.includes(`!node_modules/@node-llama-cpp/${foreign}/**`),
    `Linux x64 packages must exclude the ${foreign} llama.cpp binary`,
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
// Windows stays on the plain, offline NSIS installer.
//
// `nsis-web` looks like the fix for the 2 GiB NSIS ceiling that broke v0.6.0 —
// it emits a small web setup plus a separate .7z payload, so nothing is embedded
// and the 32-bit offset limit never applies. It does not help here: the payload
// simply becomes a ~4 GiB `.7z` release asset, and GitHub rejects any asset of
// 2 GiB or more, so the release job would fail at upload and any installer that
// escaped would 404 on its own payload. Keeping the installer offline also keeps
// the update path unchanged for existing v0.4.0/v0.5.0 installs.
//
// The fix was to shrink the payload instead (shared/bundled-models.ts). Moving
// to nsis-web only becomes worth revisiting if the payload has to grow past what
// a single sub-2 GiB asset can carry — and that needs somewhere other than
// GitHub Releases to host it.
assert.deepEqual(
  windows.win?.target,
  ['nsis'],
  'Windows ships one offline NSIS installer; nsis-web cannot be published under GitHub\'s 2 GiB asset limit',
);
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
  overrides?: Record<string, Record<string, string>>;
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
// @electron/osx-sign walks every file in the .app and runs isbinaryfile on each one to decide
// what to codesign. That walk happens in full BEFORE the `ignore` predicate (mac.signIgnore) is
// ever consulted, so signIgnore cannot protect the sniffer — only the version pin can. Below
// 5.0.6, isbinaryfile's protobuf-tasting path reads a length prefix out of an ONNX file and
// tries to materialise it as a JS array, throwing an uncaught `RangeError: Invalid array length`
// inside an fs.read callback that kills the whole packaging process. That is what broke the
// first release to bundle local models. 6.x is ESM-only and osx-sign require()s it, so the
// range must stay inside 5.x.
assert.equal(
  packageJson.overrides?.['@electron/osx-sign']?.isbinaryfile,
  '^5.0.6',
  'osx-sign must resolve an isbinaryfile whose protobuf sniffer cannot crash on bundled ONNX weights',
);
const packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
  packages: Record<string, { version?: string }>;
};
const lockedSniffers = Object.entries(packageLock.packages)
  .filter(([specifier]) => specifier.endsWith('node_modules/isbinaryfile'));
assert.ok(lockedSniffers.length > 0, 'the lockfile must pin isbinaryfile for reproducible CI packaging');
for (const [specifier, entry] of lockedSniffers) {
  const [major, minor, patch] = (entry.version ?? '0.0.0').split('.').map(Number);
  assert.ok(
    major === 5 && (minor > 0 || patch >= 6),
    `${specifier} resolves to isbinaryfile ${entry.version}; packaging needs >=5.0.6 <6 (the crash fix, still CommonJS)`,
  );
}

assert.match(
  packageJson.scripts['desktop:build:main'],
  /native-rhythm-worker\.ts.*native-rhythm-worker\.mjs/,
  'desktop build must bundle the native rhythm utility process',
);
assert.match(
  packageJson.scripts['build:builtin-llm-worker'],
  /builtin-llm-worker\.ts.*desktop-dist\/builtin-llm-worker\.mjs/,
  'the built-in LLM worker must have its own esbuild step',
);
assert.match(
  packageJson.scripts['desktop:build:main'],
  /build:builtin-llm-worker/,
  'desktop builds must produce the built-in LLM worker they package',
);
// The HyperFrames route runs in the Vite dev server too, and it forks the same
// built worker file — so `npm run dev` has to have built one, or the built-in
// model would only work in a packaged app.
for (const script of ['predev', 'predev:isolated', 'predev:shared']) {
  assert.match(
    packageJson.scripts[script] ?? '',
    /build:builtin-llm-worker/,
    `${script} must build the worker so the built-in model works in dev too`,
  );
}
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
// The script names the target explicitly, so it has to name the same one the
// config declares — otherwise a config change to win.target would be silently
// ignored on every real build. See the nsis-web note above.
assert.match(
  windowsDistScript,
  /'--win','nsis'/,
  'the Windows dist script must build the offline NSIS target the config declares',
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

// The AquariusOS overlay downloads release assets by name rather than through
// electron-updater, so its URLs must follow the same artifactName and the same repository
// the packaging config publishes to. Drift here would 404 every OS-managed update.
const overlayAssets = overlayReleaseAssets('0.4.1');
assert.equal(overlayAssets.assetName, 'AquariusEditor-0.4.1-x86_64.AppImage');
assert.equal(
  overlayAssets.assetName,
  arm64.artifactName
    ?.replace('${version}', '0.4.1')
    .replace('${arch}', 'x86_64')
    .replace('${ext}', 'AppImage'),
  'the overlay asset name must follow the packaged artifactName',
);
assert.equal(
  RELEASE_DOWNLOAD_BASE,
  `https://github.com/${arm64.publish?.[0]?.owner}/${arm64.publish?.[0]?.repo}/releases/download`,
  'the overlay must download from the repository packaging publishes to',
);
assert.equal(overlayAssets.appImageUrl, `${RELEASE_DOWNLOAD_BASE}/v0.4.1/${overlayAssets.assetName}`);
assert.equal(overlayAssets.checksumsUrl, `${RELEASE_DOWNLOAD_BASE}/v0.4.1/${CHECKSUM_ASSET_NAME}`);

// The overlay does its own version check (electron-updater will not run one without APPIMAGE,
// which AquariusOS does not set). It must ask the same feed the renderer does, or the two
// halves of the app could disagree about whether an update exists. Read as source rather than
// imported: src/ui/upstreamUpdate.ts is a renderer module and pulling it into this Node
// project drags the Window augmentation with it.
const rendererUpdateSource = await readFile(new URL('../src/ui/upstreamUpdate.ts', import.meta.url), 'utf8');
const rendererFeedUrl = rendererUpdateSource.match(/latestReleaseApiUrl:\s*'([^']+)'/)?.[1];
const rendererReleasesPageUrl = rendererUpdateSource.match(/releasesPageUrl:\s*'([^']+)'/)?.[1];
assert.ok(rendererFeedUrl && rendererReleasesPageUrl, 'RELEASE_FEED must still declare both URLs as literals');
assert.equal(
  RELEASE_API_LATEST,
  rendererFeedUrl,
  'the overlay check and the renderer check must read one feed',
);

// --- network policy ---------------------------------------------------------------------
// Everything the update path talks to, so a policy change can be checked against one list.
const UPDATE_ORIGINS = ['https://api.github.com', 'https://github.com'];
for (const url of [RELEASE_API_LATEST, rendererFeedUrl, rendererReleasesPageUrl, RELEASE_DOWNLOAD_BASE]) {
  assert.ok(
    UPDATE_ORIGINS.includes(new URL(String(url)).origin),
    `${url} must live on a declared update origin`,
  );
}

// The renderer has no Content-Security-Policy today: index.html declares none and the desktop
// shell sets none on its embedded server, which is why the GitHub-API check reaches the network
// from a packaged build. Adding one without these origins would break update checks in exactly
// the silent way that is hard to diagnose from a bug report, so this test is the tripwire: add
// a policy and it starts demanding that api.github.com and github.com are in it.
const rendererHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const desktopSources = await Promise.all(
  ['embedded-server.ts', 'static-files.ts', 'main.ts'].map(
    (name) => readFile(new URL(`./${name}`, import.meta.url), 'utf8'),
  ),
);
for (const [label, source] of [
  ['index.html', rendererHtml],
  ['desktop/embedded-server.ts', desktopSources[0]!],
  ['desktop/static-files.ts', desktopSources[1]!],
  ['desktop/main.ts', desktopSources[2]!],
] as const) {
  if (!/content-security-policy/i.test(source)) continue;
  for (const origin of UPDATE_ORIGINS) {
    assert.ok(
      source.includes(origin),
      `${label} declares a Content-Security-Policy, so it must allow ${origin} — `
      + 'the update check and the releases link both go there',
    );
  }
}

const workflow = await readFile(new URL('../.github/workflows/desktop.yml', import.meta.url), 'utf8');
// electron-updater reads latest-*.yml at runtime and the blockmaps make differential
// downloads possible. Publishing installers without them ships a build that can see a new
// release but never install it — these belong with `publish` above.
assert.equal(
  overlayAssets.checksumsUrl.endsWith(`/${CHECKSUM_ASSET_NAME}`) && workflow.includes(`sha256sum ./* > ${CHECKSUM_ASSET_NAME}`),
  true,
  'the overlay verifies against the checksum manifest the release workflow generates',
);
for (const channel of ['latest-arm64-mac.yml', 'latest-x64-mac.yml', 'latest-x64.yml', 'latest-x64-linux.yml']) {
  assert.ok(
    workflow.includes(`release/${channel}`) && workflow.includes(`release-files/${channel}`),
    `${channel} must be both uploaded from the packaging job and required by the release gate`,
  );
}
assert.match(workflow, /release\/\*\.blockmap/, 'differential update metadata must be published');
assert.match(workflow, /EXPECTED_VERSION="\$\{GITHUB_REF_NAME#v\}"/, 'release gate must derive its package version');
for (const blockmap of ['arm64.zip', 'x64.zip', 'x64.exe']) {
  assert.ok(
    workflow.includes(`release-files/AquariusEditor-\${EXPECTED_VERSION}-${blockmap}.blockmap`),
    `the release gate must require the ${blockmap} blockmap`,
  );
}
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

console.log('update-packaging.verify: fork identity, icons, release feed, overlay assets, and packaging contract OK');
