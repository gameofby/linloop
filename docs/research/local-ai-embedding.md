# 本地 AI 运行时内置评估

核验日期：2026-11-24。范围：macOS Electron 应用 Linloop。模型来源限制：仅 Ollama 官方 `library`。本文为研究记录，不代表已实施内置方案。

## 结论

建议继续使用完整官方 Ollama 运行时。可将其随应用分发，也可在首次设置时下载。**内置完整运行时在技术上可行，代价是约 188 MB 的额外压缩数据**，需通过最终 DMG 构建测量实际增量。模型仍单独下载。不能以 `ollama` 单个可执行文件的大小判断成本。独立 MLX 方案目前不适合本项目：它新增另一套原生集成或 Python 环境，且官方通用模型加载路径依赖其他模型源。[Ollama 构建脚本](https://github.com/ollama/ollama/blob/v0.40.17/scripts/build_darwin.sh)、[MLX LM 说明](https://pypi.org/project/mlx-lm/0.32.2/)。

## Ollama：完整包及平台

下表来自 GitHub 官方 Release API，单位为 bytes；MB 使用十进制，MiB 使用 1,048,576 bytes。

| 版本 | 完整运行时 `ollama-darwin.tgz` | 官方 GUI ZIP | 官方 DMG |
| --- | ---: | ---: | ---: |
| 固定版本 v0.40.17 | 187,626,746（187.63 MB / 178.93 MiB） | 230,778,782 | 231,575,873 |
| 核验时最新稳定版 v0.40.18 | 188,838,885（188.84 MB / 180.09 MiB） | 231,986,751 | 232,758,599 |

来源：[v0.40.17 API](https://api.github.com/repos/ollama/ollama/releases/tags/v0.40.17)、[v0.40.18 API](https://api.github.com/repos/ollama/ollama/releases/tags/v0.40.18)。这些是完整压缩资产大小，不是解包后的磁盘占用，也不包含模型。

本次在 Mac mini 上下载并校验 v0.40.17 后，完整解压目录的 `du -sk` 结果为 597,332 KiB，约 583.33 MiB。该数值不含模型，属于本机磁盘占用测量，文件系统不同可能有差异。可在真实安装测试打印的目录下执行 `du -sk "<test-directory>/ollama"` 复查；将 `<test-directory>` 替换为脚本打印的测试目录。运行时包含的 CLI 约 76 MiB，不能代表完整依赖体积。[固定官方资产](https://api.github.com/repos/ollama/ollama/releases/assets/774304881)。

固定资产 ID 为 `774304881`，SHA-256 为 `4b9db20d077c5a1e52fb4a6f2e6791f76ae945fd07c9b1a5647c82e927826653`。应固定版本与摘要，避免静默更新改变安装结果。[资产 API](https://api.github.com/repos/ollama/ollama/releases/assets/774304881)。

官方打包脚本明确包括 `ollama`、`llama-server`、`llama-quantize`、动态库、Metal 库、MLX 后端目录、第三方 LICENSE/NOTICE。脚本将 arm64 与 x86_64 合并为通用运行时。因此，不能只复制 CLI，不能漏掉同包动态库或 Metal 资源。[打包与签名脚本](https://github.com/ollama/ollama/blob/v0.40.17/scripts/build_darwin.sh)。

官方当前最低系统要求是 macOS 14。Apple M 系列支持 CPU 和 GPU；Intel x86 仅支持 CPU。运行已构建的官方包不需要安装 Python、CMake 或 Xcode；这些工具用于源码构建。[macOS 要求](https://docs.ollama.com/macos)、[构建脚本](https://github.com/ollama/ollama/blob/v0.40.17/scripts/build_darwin.sh)。

Ollama 源码采用 MIT，允许再分发，但须保留版权与许可文本。完整包的第三方许可也须保留。应用内再分发仍需对嵌套二进制、动态库和外层 Electron 应用执行签名与公证验证；官方脚本对这些文件分别签名。[Ollama LICENSE](https://github.com/ollama/ollama/blob/v0.40.17/LICENSE)、[签名脚本](https://github.com/ollama/ollama/blob/v0.40.17/scripts/build_darwin.sh)。模型许可独立于运行时许可；官方默认 `qwen2.5:0.5b` 页面列出 Apache 2.0。[模型页](https://ollama.com/library/qwen2.5:0.5b)。

## “Ollama MLX”与独立 MLX 不同

**官方 Ollama 完整包已经包含 MLX 后端，不需要再装 `mlx-lm`。** 但包含后端不表示所有模型自动使用 MLX。固定版本中，`Model.IsMLX()` 仅在模型格式为 `safetensors` 时返回 true；调度器据此选择 MLX 或 llama.cpp。[格式判断](https://github.com/ollama/ollama/blob/v0.40.17/server/images.go)、[调度器](https://github.com/ollama/ollama/blob/v0.40.17/server/sched.go)。

`qwen2.5:0.5b` 是官方库的 398 MB Q4_K_M 模型。官方清单引用的配置明确为 `model_format: gguf`。结合上述调度逻辑，它使用 llama.cpp 路径，不会仅因 Apple Silicon 或运行时包含 MLX 就自动改用 MLX。应保留该路径，并用实际运行日志或 `/api/ps` 核验后端。[模型页](https://ollama.com/library/qwen2.5:0.5b)、[官方清单](https://registry.ollama.ai/v2/library/qwen2.5/manifests/0.5b)、[模型配置](https://registry.ollama.ai/v2/library/qwen2.5/blobs/sha256:005f95c7475154a17e84b85cd497949d6dd2a4f9d77c096e3c66e4d9c32acaf5)、[调度器](https://github.com/ollama/ollama/blob/v0.40.17/server/sched.go)。

## 独立 MLX：不能只看小型 wheel

官方 PyPI 发行数据给出以下示例，目标为 macOS 14 arm64、CPython 3.11：

| 组件 | 固定版本 | 压缩 wheel 大小 |
| --- | --- | ---: |
| `mlx` | 0.32.4 | 671,764 bytes |
| 强制依赖 `mlx-metal` | 0.32.4 | 44,958,619 bytes |
| `mlx-lm` | 0.32.2 | 546,040 bytes |

来源：[mlx 元数据](https://pypi.org/pypi/mlx/0.32.4/json)、[mlx-metal 元数据](https://pypi.org/pypi/mlx-metal/0.32.4/json)、[mlx-lm 元数据](https://pypi.org/pypi/mlx-lm/0.32.2/json)。这三项合计 46,176,423 bytes，**仍不是完整运行时**：尚缺 Python 解释器、NumPy、Transformers、SentencePiece、Protobuf、PyYAML、Jinja2 及其传递依赖、模型与分词器。完整体积必须在固定 Python 版本、锁定依赖并制作部署包后测量。

官方 Python 安装文档要求 Apple Silicon、原生 Python 与 macOS 14；`mlx-lm` 0.32.2 要求 Python 3.11 或更新版本。不能把该发行路径作为 Intel Mac 的统一方案。[MLX 安装要求](https://ml-explore.github.io/mlx/build/html/install.html)、[mlx-lm 元数据](https://pypi.org/pypi/mlx-lm/0.32.2/json)。

MLX 有 C++、C、Swift 接口，可构建原生 helper 后由 Electron 启动。Swift 官方项目说明了 Xcode/SwiftPM 集成和 Metal 着色器构建限制；这是一条可行的新开发路线，不是现成 Ollama 运行时的替换。其最终 macOS 应用体积没有统一官方数值，必须测量实际 helper 和必需资源。[MLX Swift](https://github.com/ml-explore/mlx-swift)、[MLX C++ 部署与体积选项](https://ml-explore.github.io/mlx/build/html/install.html)。MLX 使用 MIT，仍须保留许可及依赖声明。[MLX LICENSE](https://github.com/ml-explore/mlx/blob/main/LICENSE)。

在仅允许 Ollama 官方模型下载的约束下，不应引入独立 `mlx-lm` 的默认 Hub 下载流程。先前取得的其他来源模型文件，也不能作为此次官方下载验证的证据。[MLX LM 官方使用说明](https://pypi.org/project/mlx-lm/0.32.2/)。

## 模型下载与恢复

Ollama `POST /api/pull` 默认返回流式进度，包含状态、digest、total、completed。Linloop 可直接显示这些数据。固定版本下载实现保存 `-partial` 数据及分片状态；重试会读取已完成偏移并发送 HTTP Range。因此，在不删除缓存、模型存储目录不变且上游仍支持同一 blob 的情况下，可重新 pull 同一模型来恢复下载。[API](https://docs.ollama.com/api/pull.md)、[固定版本下载实现](https://github.com/ollama/ollama/blob/v0.40.17/server/download.go)。

这是模型下载恢复能力。运行时 tgz 的恢复由 Linloop 的下载器负责；需单独保存 partial、验证 Range 响应，并在完成后核验 SHA-256。内置运行时可去掉这次首次下载，但不会去掉约 398 MB 默认模型下载，也不会消除模型断点续传需求。[模型大小](https://ollama.com/library/qwen2.5:0.5b)。

## 实施选择

1. 当前版本优先复用已安装的 Ollama；缺失时下载完整固定官方运行时，显示字节进度并支持恢复。
2. 如果用户要求首次设置少一次下载，可提供内置完整运行时的构建。预期增加约 188 MB 压缩负载；最终 DMG 增量与解包体积须实测。
3. 保留官方模型名称校验和 `registry.ollama.ai/library` 限制。让 Ollama 选择适配的执行后端。不要增加外部模型源。
4. 独立 MLX 仅作为后续原生方案研究。实施前需证明官方来源模型格式兼容、Intel 回退方案和完整部署体积。

## 本次安装恢复验证

2026-11-24 在 Apple Silicon Mac mini 上，使用独立临时目录、端口 `21437`、私有运行时和空模型缓存完成验证。没有删除或替换原有 Ollama 安装及其模型。

- 运行时下载中断后保留 partial，并从相应 HTTP Range 继续；完整内容通过固定官方 SHA-256 校验。因本机网络缓慢，整包测试使用了官方资源的并行 Range 传输适配器；生产下载器仍使用单个可恢复请求。
- 下载默认官方 `qwen2.5:0.5b`，多次主动中断并重启服务。恢复使用同一模型目录。强制停止服务时，部分在途数据可能重新下载；已完成分片仍可复用。
- 模型完成摘要校验并写入清单后，状态返回 Ready。真实 `/api/generate` 请求返回了结果。
- 再次初始化时，测试禁止运行时下载和 `/api/pull` 请求，初始化仍成功。
- 独立设置查询在安装恢复期间可正常返回。测试脚本为 `scripts/verify-clean-install.ts`；重复中断参数及测试目录恢复方法见两份 README。
- 快速回归检查覆盖 partial 保留、Range 恢复、服务端忽略 Range、解压中断、压缩包复用、旧版健康运行时复用，以及设置进度条和重试。Mac 发布工作流执行类型检查与安装恢复回归检查。

修复对应两项已复现的问题：下载错误处理删除了 partial；解压直接写入正式目录，并仅凭可执行文件存在判断安装完成。现在保留下载数据，先完成临时目录解压和运行检查，再启用运行时。
