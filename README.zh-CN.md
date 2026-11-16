<p align="center">
  <img src="build/icon.png" width="112" height="112" alt="Linloop 图标">
</p>

<h1 align="center">Linloop</h1>

<p align="center">用英语 ∞ 改正错误</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

Linloop 是一款适用于 macOS 的英语练习桌面应用。通过快捷键，在当前应用上方打开一个小窗口。输入句子，即可获得一条语法纠错结果和一条自然改写。Linloop 使用本地 [Ollama](https://ollama.com) 模型。

项目目前处于原型阶段，仅支持英语练习，暂不支持跨设备同步。

## 功能

- **Grammar correction（语法纠错）：** 修正拼写和语法错误。
- **Refine（优化表达）：** 提供一个自然的表达方式，并将已存储的单词、句型和常用搭配作为模型上下文。
- **流式结果：** 模型生成过程中即可阅读结果，模型名称以小字显示在右下角。
- **复制结果：** 点击结果旁的 **Copy** 即可复制英文，再粘贴到其他应用。
- **macOS 词典：** 优先查询单词或固定表达，显示简短释义和中文翻译。没有词条时，使用 Ollama。
- **macOS 朗读：** 点击输入框或结果旁的扬声器图标即可朗读。朗读使用系统语音，支持离线使用。点击停止图标可停止朗读；窗口关闭或隐藏时也会停止。
- **词典发音：** 点击词典中的单词、音标或扬声器图标，使用 macOS 系统语音朗读英文。再次点击即可停止。
- **快捷调用：** 使用 `Cmd+Shift+L` 打开窗口。窗口也可显示在全屏应用上方。

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
3. 输入英语句子，等待 **Grammar correction** 和 **Refine** 结果。
4. 点击结果旁的 **Copy**，将英文复制并粘贴到目标应用。

每个区域显示一条结果。点击 **Grammar correction** 或 **Refine** 结果旁的 **Copy** 即可复制英文，也可以直接点击结果文字。在输入框中按 Enter 复制 Refine 结果。如果只有语法纠错结果，Enter 会复制该结果。按 Escape 隐藏窗口。

对于词典结果，点击单词、音标或扬声器图标即可听到英文发音。再次点击同一控件即可停止。此功能使用 macOS 内置语音，无需运行 Ollama。

修改快捷键：

1. 点击齿轮图标。
2. 点击快捷键输入框，按下新的组合键。
3. 点击 **Save**。

如果组合键不可用，原快捷键会继续生效。点击 **Use default hotkey**，再点击 **Save**，可恢复默认快捷键。输入框提示会显示已保存的快捷键。

在 macOS 上，如果系统为全局快捷键请求辅助功能权限，请允许访问。

拖动顶部栏的空白区域或分区标题即可移动窗口，也可以将窗口拖到扩展显示器。可拖动区域显示张开的手形指针，拖动时显示握紧的手形指针。

点击齿轮图标可修改 Ollama 服务地址、模型、词典优先查询选项和主题。

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
