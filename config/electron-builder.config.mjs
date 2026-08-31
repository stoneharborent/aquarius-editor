// Desktop packaging configuration, introduced in M2 and expanded to three targets in M4. Output: release/.
// Run npm run desktop:dist(:mac-x64 / :win). The pipeline is Vite build → esbuild main process
// → prebuild Remotion bundle → prepare target binaries → electron-builder.
// Notes:
// - files includes only the main-process bundle; electron-builder collects production node_modules automatically.
//   @remotion/renderer is required at runtime, while @remotion/bundler is used only during prebuild.
//   Keep only the CC_EB_TARGET compositor package because each one is about 180 MB.
// - asar stays disabled because @remotion/renderer chmods and spawns the compositor at its resolved path.
//   Even when unpacked, an asar path still points inside the archive and chmod fails with ENOTDIR.
//   Expanding real files avoids that failure at the cost of extra small-file I/O during startup.
// - dist and the prebuilt Remotion bundle use extraResources. prepare-target populates the
//   chrome-headless-shell staging directory, main.ts locates it through process.resourcesPath,
//   and the bundle is copied into writable userData on first launch.
// - Without signing credentials, macOS builds use ad-hoc signing and Windows builds trigger SmartScreen.
//   Add certificates and notarization for official distribution.
// - Every icon is pre-generated from the AquariusOS logo by assets/branding/render-icons.mjs
//   (macOS .icns, Windows .ico, and a folder of Linux PNGs). Pre-generating avoids the corrupt
//   48 px layers electron-builder can produce when it converts icons itself.

// Package names follow @remotion/renderer optionalDependencies: win32 uses -msvc and Linux includes a libc suffix.
const COMPOSITORS = [
  'darwin-arm64', 'darwin-x64', 'win32-x64-msvc',
  'linux-arm64-gnu', 'linux-arm64-musl', 'linux-x64-gnu', 'linux-x64-musl',
];
const ONNX_RUNTIME_TARGETS = [
  'darwin/arm64', 'darwin/x64', 'win32/arm64', 'win32/x64', 'linux/arm64', 'linux/x64',
];
const TARGET_COMPOSITOR = { 'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-x64', 'win32-x64': 'win32-x64-msvc', 'linux-x64': 'linux-x64-gnu' };
const target = process.env.CC_EB_TARGET ?? `${process.platform}-${process.arch}`;
const keep = TARGET_COMPOSITOR[target] ?? target;
const nativeInferenceSupported = target.startsWith('darwin-')
  || target.startsWith('win32-') || target.startsWith('linux-');
const keepOnnxRuntime = nativeInferenceSupported ? target.replace('-', '/').replace('-msvc', '') : null;
const nativeInferenceWorkers = nativeInferenceSupported
  ? [
      'desktop-dist/native-asr-worker.mjs',
      'desktop-dist/native-semantic-worker.mjs',
      'desktop-dist/native-clap-worker.mjs',
      'desktop-dist/native-rhythm-worker.mjs',
      // Hosts the bundled language model (llama.cpp) for HyperFrames.
      'desktop-dist/builtin-llm-worker.mjs',
    ]
  : [];
// node-llama-cpp publishes one prebuilt llama.cpp binary per platform/backend
// as a separate @node-llama-cpp/* package, the same way onnxruntime-node and
// @remotion/compositor do. Each is 30-90 MB, so ship only the ones this
// artifact can actually load. macOS gets Metal; Windows and Linux get the plain
// CPU build plus the GPU builds for that platform, because which one loads is
// decided at runtime from the machine's hardware, not at packaging time.
const LLAMA_PACKAGES = [
  'mac-arm64-metal', 'mac-x64',
  'win-x64', 'win-arm64', 'win-x64-cuda', 'win-x64-cuda-ext', 'win-x64-vulkan',
  'linux-x64', 'linux-arm64', 'linux-armv7l', 'linux-riscv64',
  'linux-x64-cuda', 'linux-x64-cuda-ext', 'linux-x64-vulkan',
];
const TARGET_LLAMA_PACKAGES = {
  'darwin-arm64': ['mac-arm64-metal'],
  'darwin-x64': ['mac-x64'],
  'win32-x64': ['win-x64', 'win-x64-cuda', 'win-x64-cuda-ext', 'win-x64-vulkan'],
  'win32-arm64': ['win-arm64'],
  'linux-x64': ['linux-x64', 'linux-x64-cuda', 'linux-x64-cuda-ext', 'linux-x64-vulkan'],
  'linux-arm64': ['linux-arm64'],
};
const keepLlamaPackages = TARGET_LLAMA_PACKAGES[target] ?? [];
const llamaFilters = LLAMA_PACKAGES
  .filter((packageName) => !keepLlamaPackages.includes(packageName))
  .map((packageName) => `!node_modules/@node-llama-cpp/${packageName}/**`);
const onnxRuntimeFilters = keepOnnxRuntime
  ? ONNX_RUNTIME_TARGETS
      .filter((runtimeTarget) => runtimeTarget !== keepOnnxRuntime)
      .map((runtimeTarget) => `!node_modules/onnxruntime-node/bin/napi-v6/${runtimeTarget}/**`)
  : ['!node_modules/onnxruntime-node/**'];
// sqlite-vec publishes separate extension packages whose suffixes do not all
// match Node's process.platform names. Keep only the package for this artifact.
const SQLITE_VEC_PACKAGES = [
  'darwin-arm64', 'darwin-x64', 'windows-x64', 'linux-arm64', 'linux-x64',
];
const TARGET_SQLITE_VEC_PACKAGE = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'win32-x64': 'windows-x64',
  'linux-arm64': 'linux-arm64',
  'linux-x64': 'linux-x64',
};
const keepSqliteVec = TARGET_SQLITE_VEC_PACKAGE[target];
const sqliteVecFilters = SQLITE_VEC_PACKAGES
  .filter((packageSuffix) => packageSuffix !== keepSqliteVec)
  .map((packageSuffix) => `!node_modules/sqlite-vec-${packageSuffix}/**`);
const hasMacSigningCertificate = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);

// Resources directory holding the pre-installed local models. Must match
// BUNDLED_MODELS_DIR_NAME in shared/bundled-models.ts (this file is plain .mjs
// and cannot import it). Used by extraResources and by mac.signIgnore below.
const BUNDLED_MODELS_RESOURCE_DIR = 'bundled-models';

export default {
  appId: 'os.aquarius.editor',
  productName: 'Aquarius Editor',
  // The product name has a space in it, so the file name is spelled out here instead of
  // ${productName}: release files stay shell-friendly (AquariusEditor-0.2.11-arm64.dmg).
  artifactName: 'AquariusEditor-${version}-${arch}.${ext}',
  directories: { output: 'release' },
  // 7z LZMA maximum compression for the distributable installers (dmg/zip/nsis/AppImage).
  // Trade-off: noticeably slower packaging time in exchange for a smaller final download.
  // The app.asar content itself is handled by the `compression` setting; native binaries
  // (onnxruntime-node, ffmpeg-static, @remotion/compositor) remain unpacked per their filters.
  compression: 'maximum',
  // The release feed is Aquarius Editor's own GitHub Releases — never upstream's.
  // Publishing here is what makes electron-builder emit the auto-update metadata
  // (latest-*.yml + .blockmap) that electron-updater reads at runtime.
  //
  // One arch per channel: an arm64 and an x64 build of the same version would otherwise
  // overwrite each other's latest.yml and offer the wrong binary.
  //
  // These four pieces belong together — change one, check the others:
  //   1. here:  publish (below)
  //   2. src/ui/upstreamUpdate.ts       → RELEASE_FEED
  //   3. desktop/update-service.ts      → DESKTOP_UPDATE_FEED_CONFIGURED
  //   4. .github/workflows/desktop.yml  → the latest-*.yml and *.blockmap artifacts
  publish: [{
    provider: 'github',
    owner: 'stoneharborent',
    repo: 'aquarius-editor',
    channel: target.includes('arm64') ? 'latest-arm64' : 'latest-x64',
  }],
  files: [
    'desktop-dist/main.mjs',
    'desktop-dist/preload.cjs',
    ...nativeInferenceWorkers,
    'package.json',
    // Keep only the target compositor; renderer selects its package from process.platform at runtime.
    ...COMPOSITORS.filter((c) => c !== keep).map((c) => `!node_modules/@remotion/compositor-${c}/**`),
    // onnxruntime-node publishes every platform in one package; ship only this artifact's binary.
    ...onnxRuntimeFilters,
    // sqlite-vec (semantic vectors): ship only the target platform's vec0 extension.
    ...sqliteVecFilters,
    // node-llama-cpp (the bundled HyperFrames model): only this platform's builds.
    ...llamaFilters,
  ],
  asar: false,
  extraResources: [
    // Exclude media/uploads because Vite copies all of public/ into dist, which would embed gigabytes of user assets.
    // uploadsMiddleware serves /media/uploads directly from the asset directory (userData in packaged builds),
    // so resources/dist never needs those files.
    { from: 'dist', to: 'dist', filter: ['**/*', '!media/uploads/**'] },
    { from: 'desktop-dist/remotion-bundle', to: 'remotion-bundle' },
    { from: 'desktop-dist/chrome-headless-shell', to: 'chrome-headless-shell' },
    // Pre-installed local models (Whisper Small and the three intelligence
    // packs), staged by desktop/fetch-bundled-models.mts during
    // desktop:prebundle. main.ts copies whatever is missing into
    // ~/.openchatcut/asr-models on the first launch, so a fresh install never
    // waits for a model download to transcribe or analyse.
    // Adds roughly 1.3 GiB uncompressed to each installer payload.
    //
    // The HyperFrames language model is deliberately NOT in here: at 2.33 GiB
    // it pushed every artifact past GitHub's 2 GiB release-asset limit and made
    // v0.6.0 unpublishable. See shared/bundled-models.ts for the full reasoning
    // and the budget any future bundled model has to fit.
    { from: `desktop-dist/${BUNDLED_MODELS_RESOURCE_DIR}`, to: BUNDLED_MODELS_RESOURCE_DIR },
  ],
  npmRebuild: false,
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.video',
    icon: 'assets/branding/aquarius-editor-icon.icns',
    entitlements: 'desktop/entitlements.mac.plist',
    entitlementsInherit: 'desktop/entitlements.mac.plist',
    // Hardened runtime is required for Developer ID distribution. Ad-hoc local
    // and CI packages have no notarization identity, so enabling it only adds
    // library-validation restrictions without a security benefit.
    hardenedRuntime: hasMacSigningCertificate,
    // Sign the bundle ad hoc without a Developer ID so Finder still treats it as executable.
    // When CI injects CSC_LINK / CSC_NAME, electron-builder selects the official certificate automatically.
    ...(hasMacSigningCertificate ? {} : { identity: '-' }),
    // The bundled ONNX weights are data, not loadable Mach-O code — nothing in the app dlopen()s
    // them, so a signature on each one buys nothing and costs a codesign spawn per 150 MiB file.
    // electron-builder turns each entry into a RegExp tested against the absolute path.
    //
    // IMPORTANT — this is a courtesy, not the crash fix. @electron/osx-sign runs its whole
    // walkAsync() (which calls isbinaryfile on every file) BEFORE it ever consults `ignore`,
    // so an ignored file has already been sniffed by the time this matches. The actual guard
    // against the "RangeError: Invalid array length" that ONNX protobufs used to trigger is
    // the `isbinaryfile` override pinned in package.json — keep both.
    signIgnore: [`/Contents/Resources/${BUNDLED_MODELS_RESOURCE_DIR}/`],
  },
  win: {
    target: ['nsis'],
    icon: 'assets/branding/aquarius-editor-icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    target: ['AppImage'],
    // A folder of square PNGs (16…1024), regenerated by assets/branding/render-icons.mjs.
    icon: 'assets/branding/icons',
    category: 'AudioVideo',
    // Keep the executable name stable for release/linux-unpacked/aquarius-editor and CI smoke tests.
    executableName: 'aquarius-editor',
    // Pair with package.json desktopName so desktop environments associate the window with its .desktop entry.
    syncDesktopName: true,
  },
};
