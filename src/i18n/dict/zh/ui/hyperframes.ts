// ZH dictionary shard (key = English source string, value = Chinese).
// Hyperframes: prompt-driven graphic generation (Library tab + timeline prompt).
export default {
  'Hyperframes': 'Hyperframes 图形',
  'Hyperframes…': 'Hyperframes 图形…',
  'Describe the graphic you want…': '描述你想要的图形…',
  'Generate': '生成',
  'Generating…': '生成中…',
  'Failed': '失败',
  'Retry': '重试',
  'Dismiss': '忽略',
  'Regenerate': '重新生成',
  'Rename': '重命名',
  'Rename graphic': '重命名图形',
  'No graphics yet. Describe one above, or right-click a timeline track and choose Hyperframes to generate one straight into the edit.':
    '还没有图形。在上方输入描述，或在时间线轨道上右键选择 Hyperframes，直接生成到剪辑里。',
  'Click to add at the playhead, or drag onto a track: {name}': '点击添加到播放头处，或拖到轨道上：{name}',
  'Press Enter to generate. The clip drops in at {at} when it is ready, and is saved to the Hyperframes tab.':
    '按回车开始生成。完成后片段会自动落在 {at}，同时保存到 Hyperframes 标签页。',
  'Generating a graphic — it drops in when it is ready.': '正在生成图形 — 完成后会自动落到时间线上。',
  'Set up graphic generation': '配置图形生成',
  'Connect a model to generate graphics': '连接模型以生成图形',
  'Hyperframes writes each graphic with a language model. Pick a provider and paste its API key — the key is stored on this machine and never leaves it. Local runtimes need no key.':
    'Hyperframes 用语言模型编写每个图形。选择服务商并粘贴 API 密钥 — 密钥只保存在本机，不会外传。本地运行时无需密钥。',
  'Provider': '服务商',
  'API key': 'API 密钥',
  'Paste the API key': '粘贴 API 密钥',
  'Save and continue': '保存并继续',
  'Saving…': '保存中…',
  // The bundled model: generation works out of the box, and connecting a
  // provider becomes an upgrade rather than a prerequisite.
  'Generating with the built-in model · use a stronger one': '正在使用内置模型生成 · 换用更强的模型',
  'Use a stronger model': '换用更强的模型',
  'Use a stronger model for graphics': '为图形换用更强的模型',
  'Graphics are being written by the model built into this app, which runs entirely on your machine. Connecting a larger model usually follows a complicated brief more closely. The key is stored on this machine and never leaves it.':
    '图形由内置于本应用的模型编写，全部在你的机器上运行。连接更大的模型通常能更准确地实现复杂的描述。密钥只保存在本机，不会外传。',
  'The built-in model has not been downloaded yet. You can fetch it from the previous card, or generate with whichever provider you connect here — a local runtime (Ollama or LM Studio) needs no key and no account.':
    '内置模型尚未下载。你可以从上一张卡片获取它，或改用在这里连接的服务商生成 — 本地运行时（Ollama 或 LM Studio）无需密钥，也无需账号。',
  'The built-in model file is the wrong size, so it was not loaded. Connect a provider here to keep generating.':
    '内置模型文件大小不正确，未能加载。请在这里连接服务商以继续生成。',
  'This build has no local model runtime, so the built-in model cannot run. Connect a provider here.':
    '此版本不含本地模型运行时，内置模型无法运行。请在这里连接服务商。',
  'The built-in model is still downloading. You can wait for it, or connect a provider here and generate now.':
    '内置模型仍在下载中。你可以等待下载完成，或在这里连接服务商立即生成。',
  // The first-launch download of the built-in model: the weights are too large
  // to ship inside the installer, so the app fetches them itself.
  'Set up the built-in graphics model': '设置内置图形模型',
  'Setting up the built-in graphics model ({size}) — {percent}%': '正在设置内置图形模型（{size}） — {percent}%',
  'Built-in graphics model — paused at {percent}%': '内置图形模型 — 已在 {percent}% 暂停',
  'The built-in graphics model could not be downloaded': '内置图形模型下载失败',
  'It downloads once, in the background, and then graphics generate with nothing configured. You can keep working — this does not need the app open on this tab.':
    '它只在后台下载一次，之后无需任何配置即可生成图形。你可以继续工作 — 不必停留在这个标签页。',
  'Resuming continues from where it stopped; nothing already downloaded is thrown away.':
    '继续下载会从中断处接着进行，已下载的内容不会丢失。',
  'Nothing was kept from the failed attempt. Trying again is safe.':
    '失败的这次下载没有留下任何文件，可以放心重试。',
  'Downloading it once makes graphic generation work with no account, no key and no setup. It runs entirely on this machine.':
    '下载一次后，生成图形便无需账号、密钥或任何配置。它完全在你的机器上运行。',
  'Download progress': '下载进度',
  'Pause': '暂停',
  'Resume download': '继续下载',
  'Try again': '重试',
  'Download built-in model ({size})': '下载内置模型（{size}）',
  'Not now': '暂不下载',
  'Use your own model instead': '改用你自己的模型',
};
