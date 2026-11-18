<p align="center">
  <img src="build/icon.png" width="112" height="112" alt="Linloop 图标">
</p>

<h1 align="center">Linloop</h1>

<p align="center">用英语和法语 ∞ 改正错误</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

Linloop 是一款适用于 macOS 的英语和法语练习桌面应用。通过快捷键，在当前应用上方打开一个纸张风格的编辑器。输入单词、句子或段落，即可获得一条语法纠错结果和一条自然改写。Linloop 使用本地 [Ollama](https://ollama.com) 模型。

项目目前处于原型阶段，支持英语和法语练习，暂不支持跨设备同步。

## 功能

- **纸张编辑器：** 默认使用米黄色纸张和圆润的手写字体，输入与结果使用相同的字体和字号。可在设置中选择 Cream（米黄）、White（白色）或 Dark（深色）。
- **段落输入：** 按 Enter 换行。停止输入 1.5 秒后，Linloop 在原文下方生成结果。长文本输入区和纸张页面均可滚动。
- **练习语言：** 在设置中选择 English 或 French。Linloop 会保存所选语言，界面仍为英文。
- **Grammar correction（语法纠错）：** 修正拼写和语法错误。
- **Refine（优化表达）：** 提供一个自然的表达方式，英语模式下，将已存储的单词、句型和常用搭配作为模型上下文。
- **流式结果：** 模型生成过程中即可阅读结果，模型名称以小字显示在右下角。
- **复制结果：** 点击结果旁的 **Copy** 即可复制结果文本，再粘贴到其他应用。
- **macOS 词典（仅限英语）：** 优先查询单词或固定表达，显示简短释义和中文翻译。没有词条时，使用 Ollama。
- **macOS 朗读：** 点击输入框或结果旁的扬声器图标即可朗读。朗读使用系统语音，支持离线使用。点击停止图标可停止朗读；窗口关闭或隐藏时也会停止。
- **词典发音：** 点击词典中的单词、音标或扬声器图标，使用 macOS 系统语音朗读英文。再次点击即可停止。
- **快捷调用：** 使用 `Cmd+Shift+L` 打开窗口或将焦点移回窗口。点击其他位置或切换到全屏应用时，窗口保持显示。
- **中文翻译：** 每条英文或法文结果下方显示中文翻译。缺少翻译时，Linloop 会再次请求翻译；如果请求失败，会在结果文本下方显示错误提示。

## 安装

从[最新版本](https://github.com/gameofby/linloop/releases/latest)下载 Mac 安装包。

Linloop 支持 Intel 和 Apple Silicon Mac。打开 `.dmg` 文件，将 **Linloop** 拖入 **Applications（应用程序）**。

目前仅支持 macOS，暂时停止支持 Windows。新版本只提供 Mac 安装包。

句子纠错功能需要安装 Ollama 并下载模型，详见[配置 Ollama](#配置-ollama)。

macOS 构建使用临时签名（ad-hoc signing），未经过 Apple 公证。下载后可能被 Gatekeeper 拦截。如果你信任该副本，请先尝试打开，再前往 **系统设置 → 隐私与安全性 → 仍要打开**（如果系统提供此选项）。详见 [macOS 构建检查](#macos-构建检查)。

## 配置 Ollama

1. 安装 [Ollama](https://ollama.com)。
2. 启动 Ollama。
3. 下载默认模型：

   ```bash
   ollama pull llama3.2
   ```

Linloop 默认使用 `http://127.0.0.1:11434` 和 `llama3.2`。如需使用其他服务地址或模型，点击齿轮图标修改设置。如果所选模型不存在，Linloop 会使用可用的文本模型。

## 使用方法

1. 启动 Linloop。
2. 按 `Cmd+Shift+L`。
3. 在设置的 **Practice language** 中选择 **English** 或 **French**，点击 **Save**，然后输入对应语言的单词、句子或段落。停止输入 1.5 秒后，等待 **Grammar correction** 和 **Refine** 结果。
4. 点击结果旁的 **Copy**，将结果文本复制并粘贴到目标应用。

每个区域显示一条英文或法文结果及其下方的中文翻译。点击 **Grammar correction** 或 **Refine** 结果旁的 **Copy** 即可复制结果文本，也可以直接点击结果文字。复制后，Copy 控件会短暂显示 **Copied**。该控件与其他结果控件使用一致的样式，不会新增一行状态提示。按 Enter 换行，按 `Cmd+Enter` 立即检查文本，按 `Cmd+Shift+Enter` 复制 Refine 结果。如果只有语法纠错结果，此复制快捷键会复制该结果。方向键用于移动文本光标。

按 Escape 隐藏窗口，Linloop 会继续运行。录制快捷键时，Escape 用于取消录制。点击其他位置、切换应用或再次按全局快捷键都不会隐藏 Linloop。如需退出，请右键点击 macOS 程序坞中的 Linloop 图标，选择 **退出**。点击程序坞图标或按快捷键，可重新打开已隐藏或关闭的窗口。

对于词典结果，点击单词、音标或扬声器图标即可听到英文发音。再次点击同一控件即可停止。此功能使用 macOS 内置语音，无需运行 Ollama。

修改快捷键：

1. 点击齿轮图标。
2. 点击快捷键输入框，按下新的组合键。
3. 点击 **Save**。

如果组合键不可用，原快捷键会继续生效。点击 **Use default hotkey**，再点击 **Save**，可恢复默认快捷键。将指针移至输入区下方的提示文字，即可查看已保存的快捷键。

在 macOS 上，如果系统为全局快捷键请求辅助功能权限，请允许访问。

拖动顶部栏的空白区域或分区标题即可移动窗口，也可以将窗口拖到扩展显示器。可拖动区域显示张开的手形指针，拖动时显示握紧的手形指针。

点击齿轮图标可修改练习语言、Ollama 服务地址、模型、词典优先查询选项和主题。默认练习语言为英语。法语模式对所有输入使用 Ollama，不使用已存储的英语词汇库。更改语言后，旧结果会被清除，并根据当前输入生成新结果。

法语朗读使用已安装的 macOS 法语语音。如果没有可用的法语语音，请在 macOS 系统设置中安装。英语朗读使用系统语音。

Linloop 将数据保存在 Electron `userData` 目录下的 `linloop.sqlite` 文件中。

## 从源码运行

安装 [Bun](https://bun.sh)，并按上文配置 Ollama。然后在仓库目录中运行：

```bash
bun install
bun start
```

检查 TypeScript 代码：

```bash
bun run typecheck
```

运行 `bun run verify:window` 可检查窗口焦点、全屏切换、Escape 和系统窗口控制。运行 `bun run verify:results` 可检查段落输入、生成前的等待时间、字体一致性、滚动、翻译、复制反馈以及三种纸张主题下的结果控件。运行 `bun run verify:translation` 可通过本地测试服务，检查完整应用中的英语和法语翻译恢复、语言设置、法语模式跳过英语词典的行为及法语复制控件。这些检查会打开临时 Electron 窗口，无需运行 Ollama。窗口检查会临时打开一个全屏测试窗口。

检查 macOS 朗读功能：以下命令会播放简短语音样本，无需运行 Ollama。

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

1. 运行版本更新命令，按需选择 `patch`、`minor` 或 `major`：

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
