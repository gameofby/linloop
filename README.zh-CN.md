<p align="center">
  <img src="build/icon.png" width="112" height="112" alt="Linloop 图标">
</p>

<h1 align="center">Linloop</h1>

<p align="center">用英语和法语 ∞ 改正错误</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

Linloop 是一款适用于 macOS 的英语和法语练习桌面应用。通过快捷键，在当前应用上方打开一个纸张风格的编辑器。输入单词、句子或段落，即可获得一条语法纠错结果和一条自然改写。Linloop 使用 [Ollama](https://ollama.com) 在本地运行模型，只从 Ollama 官方模型库下载模型。

项目目前处于原型阶段，支持英语和法语练习，暂不支持跨设备同步。

## 功能

- **初始化与模型管理分开：** 初始化只准备 Ollama 和默认模型。其他模型单独下载，再从已安装模型中切换。已有运行环境和模型直接复用，不重复下载。
- **最小 Qwen 默认模型：** Intel 和 Apple Silicon 均使用 `qwen2.5:0.5b`。只允许从 Ollama 官方模型库下载，不接受第三方命名空间、网址或本地模型路径。
- **紧凑控件：** 播放和设置按钮与输入首行对齐。设置页替换编辑器，Add model 和 Preferences 默认折叠。
- **纸张编辑器：** 使用纯净纸张和标准正文字体，输入与结果采用一致的 Markdown 文档样式。可在设置中选择 Cream（微暖）、White（白色）或 Dark（深色），默认使用微暖色纸张。
- **Markdown：** 在输入区编辑 Markdown 源码。移出焦点后，显示格式化的标题、列表、强调和代码；点击格式化的输入内容可继续编辑。结果、翻译、说明以及 Grammar 和 Refine 标题均渲染为 Markdown。原始 HTML 按文本显示，链接仅显示文字且不会跳转，图片显示描述。复制时保留结果源码。
- **段落输入：** 按 Enter 换行。停止输入 0.5 秒后，Linloop 在原文下方生成结果。开始生成时，窗口会调整高度，完整显示 **Generating…** 状态。每次请求均替换原有输出，旧请求的延迟响应不会覆盖当前结果。长文本输入区和纸张页面均可滚动。
- **自动识别语言：** Linloop 使用 macOS 语言识别器，逐次识别输入是英语还是法语。Grammar 和 Refine 保持识别出的语言，不提供语言设置，界面仍为英文。过短或两种语言共用的单词可能有歧义，完整句子可提供更多识别上下文。
- **Grammar（语法纠错）：** 修正拼写和语法错误。
- **Refine（优化表达）：** 改善表达，不做摘要。提示词要求保留全部事实、问句、时间限定和否定含义。如果原文无需改动，结果可以保持不变。结果缺少问号或含下划线的标识符时，会重试一次；再次失败则显示错误。这些检查不能验证所有语义变化。英语输入时，将已存储的单词、句型和常用搭配作为模型上下文。
- **流式结果：** 模型生成过程中即可阅读结果，模型名称以小字显示在右下角。
- **复制结果：** 点击结果旁的 **Copy** 即可复制结果文本，再粘贴到其他应用。
- **macOS 词典（仅限英语）：** 优先查询单词或固定表达，显示简短释义和中文翻译。没有词条时，使用所选本地模型。
- **macOS 朗读：** 点击输入框或结果旁的扬声器图标即可朗读。朗读使用系统语音，支持离线使用。点击停止图标可停止朗读；窗口关闭或隐藏时也会停止。
- **词典发音：** 点击词典中的单词、音标或扬声器图标，使用 macOS 系统语音朗读英文。再次点击即可停止。
- **快捷调用：** 启动 Linloop 后会打开纸张，输入区显示闪动的文字光标。使用 `Cmd+Shift+L` 打开窗口或将焦点移回窗口。通过 Dock 或快捷键打开窗口时，会返回输入区，可直接输入。点击其他位置或切换到全屏应用时，窗口保持显示。
- **中文翻译：** 每条英文或法文结果下方显示中文翻译。缺少翻译时，Linloop 会再次请求翻译；如果请求失败，会在结果文本下方显示错误提示。

## 安装

从[最新版本](https://github.com/gameofby/linloop/releases/latest)下载 Mac 安装包。

Linloop 支持运行 macOS 14 或更新版本的 Intel 和 Apple Silicon Mac。打开 `.dmg` 文件，将 **Linloop** 拖入 **Applications（应用程序）**。

目前仅支持 macOS，暂时停止支持 Windows。新版本只提供 Mac 安装包。

句子纠错功能需要打开设置，仅在 Ollama 或默认模型缺失时点击 **Set up**，详见[配置本地 AI](#配置本地-ai)。

macOS 构建使用临时签名（ad-hoc signing），未经过 Apple 公证。下载后可能被 Gatekeeper 拦截。如果你信任该副本，请先尝试打开，再前往 **系统设置 → 隐私与安全性 → 仍要打开**（如果系统提供此选项）。详见 [macOS 构建检查](#macos-构建检查)。

## 配置本地 AI

1. 点击输入区旁的齿轮图标。
2. 如有需要，点击 **Set up** 安装 Ollama 并下载默认 `qwen2.5:0.5b` 模型。仅缺少默认模型时，按钮显示 **Get default model**。
3. 等待 **Ready**。Ollama 和默认模型已存在时，不显示初始化按钮。重复初始化不会重装运行环境，也不会重新拉取已有模型。

安装时显示动态进度条。运行环境下载显示百分比和已下载大小，模型下载显示当前数据层的百分比和已下载大小。如果安装中断，请重新打开设置并点击 **Continue setup**。Linloop 保留运行环境的部分下载文件，并让 Ollama 继续下载缺少的模型数据。解压失败后会复用已校验的压缩包。解压先写入临时目录，不会将半成品当作已安装的运行环境。旧版 Linloop 安装的运行环境只有通过服务健康检查后才会复用。请保留 `local-ai` 目录以保留这些进度。

默认使用 [Qwen2.5 0.5B 指令模型](https://ollama.com/library/qwen2.5:0.5b)，约 398 MB。运行环境需要额外空间。如需更可靠的纠错，可选择更大的官方模型。首次下载需要联网，已安装模型在本地运行。

### 添加或切换模型

1. 展开 **Add model**，输入 Ollama 官方模型库中的名称，例如 `qwen3:0.6b`。
2. 点击 **Download**。该操作只下载模型，不安装 Ollama，也不改变当前模型。模型已存在时直接复用，不再拉取。
3. 从 **Model** 中选择已下载的模型。选择后立即保存，不触发下载。

添加模型前必须完成 Ollama 初始化。下载仅允许访问 `registry.ollama.ai/library`，不支持自定义命名空间、外部模型仓库、网址或本地路径。模型下拉框只显示已安装模型，不提供服务地址设置。

应用优先复用 `127.0.0.1:11434` 上的 Ollama 服务或已有可执行文件。服务未运行时，可启动已有运行环境来检查本地模型，不触发下载。没有运行环境时，初始化在 Electron `userData` 目录下的 `local-ai` 中安装固定版本且经过校验的 Ollama。应用管理的运行环境将模型保存在该目录；已有 Ollama 安装仍使用自己的存储位置。退出时只停止应用自己启动的进程，不停止外部服务。

运行环境按需安装，不包含在应用安装包内。体积和平台限制见[运行环境内置研究](docs/research/local-ai-embedding.md)。

本版本不再下载 MLX、Hugging Face 或 ModelScope 模型。旧的 MLX 模型选择会恢复为 Ollama 的 Qwen 默认模型，已有 MLX 文件保留在磁盘上。快捷键、主题、词典选项和已存储词汇保持可用。

真实联网测试可运行 `bun scripts/verify-clean-install.ts`。该测试使用独立临时目录和端口 `21437`，安装官方运行环境及默认模型，分别中断下载，重启服务，再检查推理和重复初始化。测试需要联网和额外磁盘空间。设置 `LINLOOP_INSTALL_TEST_CHUNK_MIB=8` 可在每多下载 8 MiB 后重复中断。将 `LINLOOP_INSTALL_TEST_ROOT` 设为脚本打印的测试目录，可继续同一次隔离测试。脚本会打印测试目录，不再需要下载文件时可删除该目录。

## 使用方法

1. 启动 Linloop。
2. 按 `Cmd+Shift+L`。
3. 输入英语或法语单词、句子或段落。停止输入 0.5 秒后，阅读以识别出的语言生成的 **Grammar** 和 **Refine** 结果。
4. 点击结果旁的 **Copy**，将结果文本复制并粘贴到目标应用。

每个区域显示一条英文或法文结果及其下方的中文翻译。点击 **Grammar** 或 **Refine** 结果旁的 **Copy** 即可复制结果文本，也可以直接点击结果文字。复制后，Copy 控件会短暂显示 **Copied**。该控件与其他结果控件使用一致的样式，不会新增一行状态提示。按 Enter 换行，按 `Cmd+Enter` 立即检查文本，按 `Cmd+Shift+Enter` 复制 Refine 结果。如果只有语法纠错结果，此复制快捷键会复制该结果。方向键用于移动文本光标。

按 Escape 隐藏窗口，Linloop 会继续运行。录制快捷键时，Escape 用于取消录制。点击其他位置、切换应用或再次按全局快捷键都不会隐藏 Linloop。如需退出，请右键点击 macOS 程序坞中的 Linloop 图标，选择 **退出**。点击程序坞图标或按快捷键，可重新打开已隐藏或关闭的窗口。

对于词典结果，点击单词、音标或扬声器图标即可听到英文发音。再次点击同一控件即可停止。此功能使用 macOS 内置语音，无需运行模型服务。

修改快捷键：

1. 点击齿轮图标，展开 **Preferences**。
2. 点击快捷键输入框，按下新的组合键。
3. 点击 **Done**。

如果组合键不可用，原快捷键会继续生效。点击快捷键旁的重置箭头，再点击 **Done**，可恢复默认快捷键。将指针移至输入区，可通过工具提示查看已保存的快捷键。

在 macOS 上，如果系统为全局快捷键请求辅助功能权限，请允许访问。

拖动纸张边缘或分区标题即可移动窗口，也可以将窗口拖到扩展显示器。可拖动区域显示张开的手形指针，拖动时显示握紧的手形指针。

点击齿轮图标可切换已安装的模型。展开 **Preferences** 可修改快捷键、词典优先查询选项和纸张主题。每次输入和朗读均自动识别语言。法语输入使用所选本地模型，不查询英语词典，也不使用已存储的英语词汇库。直接输入另一种语言即可切换英语和法语。输入区没有占位文字，下方也不显示触发操作提示。

法语朗读使用已安装的 macOS 法语语音。如果没有可用的法语语音，请在 macOS 系统设置中安装。英语朗读使用系统语音。

Linloop 将数据保存在 Electron `userData` 目录下的 `linloop.sqlite` 文件中。

## 从源码运行

安装 [Bun](https://bun.sh)，并按上文通过设置配置本地 AI。然后在仓库目录中运行：

```bash
bun install
bun start
```

检查 TypeScript 代码：

```bash
bun run typecheck
```

运行 `bun run verify:window` 可检查启动时的输入光标、页面加载及 Dock 打开时的输入焦点、窗口焦点、全屏切换、Escape 和系统窗口控制。运行 `bun run verify:results` 可检查 Markdown 渲染、源码编辑、段落输入、生成前的等待时间、字体一致性、滚动、翻译、复制反馈以及三种纸张主题下的结果控件。运行 `bun run verify:translation` 可通过本地测试服务，检查完整应用中的英语和法语翻译恢复、自动语言识别、输出替换、法语输入跳过英语词典的行为及法语复制控件。这些检查会打开临时 Electron 窗口，无需运行模型服务。窗口检查会临时打开一个全屏测试窗口。

运行 `bun run verify:language` 可检查英语和法语的原生识别、短词、无重音符号的法语、Markdown 以及语言切换。

运行 `bun run verify:local-ai` 可检查官方模型库限制、运行环境校验、独立的初始化与下载流程，以及已安装模型复用。运行 `bun run verify:resume` 可检查下载中断、服务端忽略 Range、解压不完整，以及解压失败后的压缩包复用。运行 `bun run verify:reuse` 可确认重复初始化不发出拉取请求。运行 `bun run verify:ai-settings` 可检查紧凑布局、初始化进度与重试、独立的模型下载与切换，以及默认折叠的偏好设置。这些检查使用测试数据，不下载运行环境或模型。Mac 发布工作流在构建安装包前运行类型检查，以及本地 AI、恢复和复用检查。

检查 macOS 朗读功能：以下命令会播放简短语音样本，无需运行模型服务。

```bash
bun run verify:speech
```

## 代理工作流程

Matt Pocock 的工程技能使用 `gameofby/linloop` 的 GitHub Issues、默认分诊标签，以及根目录中的术语表和用于记录决策的 `docs/adr/`。详见 [AGENTS.md](AGENTS.md) 和 [docs/agents](docs/agents) 中的配置。

## 构建安装包

构建前先安装依赖：

```bash
bun install
```

在 macOS 上运行：

```bash
bun run dist:mac
```

DMG 文件为 `dist/Linloop-<version>-mac.dmg`。

### macOS 构建检查

打包钩子 `scripts/sign-mac.cjs` 会为打包完成的应用及其嵌套代码添加临时签名。项目使用 electron-builder 25，该版本不直接支持 `mac.identity: "-"`。当 `mac.identity` 为 `null` 时，钩子负责添加临时签名。

临时签名不能证明受信任的开发者身份，也不能替代 Apple 公证。发布工作流同样使用临时签名。`gatekeeperAssess: false` 仅控制构建时的检查，不会关闭用户 Mac 上的 Gatekeeper。

DMG 校验通过不代表 Gatekeeper 会接受其中的应用。可以使用以下命令检查本地构建：

```bash
hdiutil verify "dist/Linloop-<version>-mac.dmg"
codesign --verify --deep --strict --verbose=2 dist/mac/Linloop.app
spctl --assess --type execute --verbose=4 dist/mac/Linloop.app
```

请将 `<version>` 替换为 `package.json` 中的版本号。Apple Silicon 构建使用 `dist/mac-arm64`，而非 `dist/mac`；通用构建使用 `dist/mac-universal`。即使签名验证通过，临时签名构建仍预期无法通过 `spctl` 检查。

如需发布可通过 Gatekeeper 的版本，请安装 **Developer ID Application** 证书，或提供 `CSC_LINK` 和 `CSC_KEY_PASSWORD`。同时配置以下公证凭据：

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

使用 electron-builder 25 时，构建命令如下：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=true bun run dist:mac \
  -c.mac.identity="YOUR NAME (TEAMID)" \
  -c.mac.hardenedRuntime=true -c.mac.notarize=true \
  -c.forceCodeSigning=true
```

发布经过公证的版本前，请在 macOS 发布工作流中提供相同的凭据和构建设置。使用 `codesign` 和 `spctl` 检查应用，并验证附加的公证票据：

```bash
xcrun stapler validate path/to/Linloop.app
```

## 发布版本

版本号通过 Git 标签和 `package.json` 管理。

1. 每次发布使用 `patch`。只有明确要求时，才使用 `minor` 或 `major`：

   ```bash
   bun run version:bump patch
   ```

   脚本会更新 `package.json`、创建提交，并创建附注标签。

2. 推送提交和标签，使用脚本输出的实际标签：

   ```bash
   git push origin HEAD vX.Y.Z
   ```

   请将 `vX.Y.Z` 替换为版本更新命令输出的实际标签。

匹配 `v*.*.*` 的标签会触发[发布工作流](.github/workflows/release.yml)。工作流会：

- 从标签设置 `package.json` 中的版本号。
- 构建适用于 Intel 和 Apple Silicon 的 macOS 通用应用。
- 将 `.dmg` 文件直接上传到 GitHub Release 草稿。
- 在 macOS 构建成功后发布版本。包含 `-` 的版本号会标记为预发布版本。

如需手动构建发布版本，打开 **Actions → Release Builds → Run workflow**。版本输入为可选项；留空时使用 `package.json` 中的版本号。

正式发布使用 `vX.Y.Z` 标签，不要使用 `build-<sha>` 标签。
