<p align="center">
  <img src="build/icon.png" width="112" height="112" alt="Linloop icon">
</p>

<h1 align="center">Linloop</h1>

<p align="center">Use English and French ∞ Correct mistakes</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

Linloop is a macOS desktop app for English and French practice. Use a keyboard shortcut to open a paper-style editor above your current app. Write a word, sentence, or paragraph to get one grammar correction and one natural rewrite. Linloop uses [Ollama](https://ollama.com) for local inference and downloads models only from its official library.

This project is a prototype. It supports English and French practice. It does not synchronize data between devices.

## Features

- **Separate setup and models:** Initial setup prepares Ollama and the default model. Add other models separately, then select an installed model to use it. Existing installations and models are reused without another download.
- **Small Qwen default:** Intel and Apple Silicon both use `qwen2.5:0.5b`. Downloads use only the official Ollama library. Third-party namespaces, URLs, and local model paths are not accepted.
- **Compact controls:** Playback and settings align with the first input line. Settings replace the editor; Add model and Preferences stay collapsed until opened.
- **Paper editor:** Write on plain paper with a standard text font. Input and results use the same Markdown document style. Select Cream, White, or Dark in settings. Cream is the default, with a faint warm tint.
- **Markdown:** Edit Markdown source in the input. Move focus out of the input to see formatted headings, lists, emphasis, and code. Click the formatted input to edit it again. Results, translations, notes, and the Grammar and Refine headings use rendered Markdown. Raw HTML stays as text. Links show their labels without navigation; images show their descriptions. Copy preserves the result source.
- **Paragraph input:** Press Enter for a new line. After a 0.5-second pause, Linloop generates results below your writing. The window expands to show the initial **Generating…** status in full. Each request replaces the previous output; late responses from older requests do not replace current results. Long drafts and the paper can scroll.
- **Automatic language:** Linloop detects English or French for each input with the macOS language recognizer. Grammar and Refine stay in the detected language. There is no language setting. The interface stays in English. Short or shared words can be ambiguous; a sentence gives the recognizer more context.
- **Grammar:** Correct spelling and grammar.
- **Refine:** Improve wording without summarizing. The prompt requires all facts, questions, time qualifiers, and negations to remain. If the input needs no change, the result can stay the same. A missing question mark or underscore identifier triggers one retry; a repeated failure shows an error. These checks do not verify all changes in meaning. For English input, the model uses stored words, sentence patterns, and common word combinations as context.
- **Results as they arrive:** Read each result while the model generates it. The model name appears as a tiny note at the bottom right.
- **Copy results:** Select **Copy** beside a result to copy the result text. Then paste it into another app.
- **macOS Dictionary (English only):** Look up a word or fixed expression first. Read a short entry with Chinese translations. If no entry is available, Linloop uses the selected local model.
- **macOS speech:** Select the speaker icon beside the input or a result to hear it. Speech uses a macOS voice and works without a network connection. Select the stop icon to stop speech. Speech also stops when the window closes or hides.
- **Dictionary pronunciation:** Select the dictionary word, phonetic text, or speaker icon to hear the English word with the macOS system voice. Select it again to stop.
- **Window access:** Starting Linloop opens the paper with a blinking text cursor in the input. Open or focus the window with `Cmd+Shift+L`. Opening the window from the Dock or shortcut returns to the input, ready to type. It stays visible when you click elsewhere or switch to a full-screen app.
- **Chinese translations:** Read the Chinese translation below each English or French result. Linloop requests a missing translation again. If that request fails, it shows an error below the result text.

## Install

Download the Mac installer from the [latest release](https://github.com/gameofby/linloop/releases/latest).

Linloop supports macOS 14 or newer on Intel and Apple Silicon. Open the `.dmg` file. Drag **Linloop** into **Applications**.

macOS is the only supported platform. Windows support is suspended. New releases contain a Mac installer only.

For sentence corrections, open settings. Select **Set up** only if Ollama or the default model is missing. See [Set up local AI](#set-up-local-ai).

The macOS builds use ad-hoc signatures. They do not have Apple notarization. Gatekeeper can block a downloaded copy. If you trust the copy, try to open it. Then use **System Settings → Privacy & Security → Open Anyway**, if available. See [macOS build checks](#macos-build-checks) for more information.

## Set up local AI

1. Select the gear icon beside the input.
2. If needed, select **Set up** to install Ollama and download the default `qwen2.5:0.5b` model. If only the default model is missing, the button says **Get default model**.
3. Wait for **Ready**. When Ollama and the default model are already present, no setup button appears. Repeated setup does not reinstall the runtime or pull an existing model again.

Setup shows a live progress bar. Runtime downloads show the percentage and downloaded size. Model downloads show the current layer percentage and downloaded size. If setup stops, open settings and select **Continue setup**. Linloop keeps partial runtime downloads and asks Ollama to resume missing model data. A verified runtime archive is reused after an extraction failure. Extraction uses a temporary directory; incomplete files are not used as an installed runtime. A runtime from an older Linloop version is reused only after its service passes a health check. Keep the `local-ai` directory to retain this progress.

The default is the [Qwen2.5 0.5B instruction model](https://ollama.com/library/qwen2.5:0.5b), about 398 MB. Runtime downloads need additional space. Select a larger official model if you need more reliable corrections. Initial downloads need an internet connection; installed models run locally.

### Add or switch a model

1. Open **Add model** and enter an official Ollama library name, such as `qwen3:0.6b`.
2. Select **Download**. This downloads that model only. It never installs Ollama and does not change the current model. An existing model is reused without another pull.
3. Select the downloaded model under **Model** to use it. Selection saves immediately and never starts a download.

Ollama must be set up before adding models. Downloads are restricted to `registry.ollama.ai/library`. Custom namespaces, external registries, URLs, and local paths are not supported. Only installed models appear in the selector. There is no service-address setting.

Linloop reuses a local Ollama service at `127.0.0.1:11434` or an installed executable. It can start an existing runtime to check local models without downloading them. If no runtime exists, initial setup installs a pinned, checksum-verified runtime in the Electron `userData` directory under `local-ai`. An app-managed runtime keeps its models there; an existing Ollama installation keeps its own storage. Linloop stops processes it started when it quits and leaves external services running.

The runtime is installed on demand rather than included in the app installer. See [runtime embedding research](docs/research/local-ai-embedding.md) for the size and platform review.

This version no longer downloads MLX, Hugging Face, or ModelScope models. An older MLX model selection resets to the Ollama Qwen default. Existing MLX files are left on disk. Hotkeys, themes, dictionary options, and stored vocabulary are preserved.

For a real network test, run `bun scripts/verify-clean-install.ts`. It installs the official runtime and default model in a separate temporary directory on port `21437`, interrupts each download, restarts the service, and checks inference and repeat setup. It needs internet access and additional disk space. Set `LINLOOP_INSTALL_TEST_CHUNK_MIB=8` to repeat the model interruption after each further 8 MiB. Set `LINLOOP_INSTALL_TEST_ROOT` to the printed test directory to continue that isolated test. The script prints the test directory; remove that directory after the test if you do not need its downloaded files.

## Use Linloop

1. Start Linloop.
2. Press `Cmd+Shift+L`.
3. Write a word, sentence, or paragraph in English or French. Pause for 0.5 seconds. Read the **Grammar** and **Refine** results in the detected language.
4. Select **Copy** beside the result. Paste it into your target app.

Each section has one result, with its Chinese translation below it. Select **Copy** beside **Grammar** or **Refine**, or select the result text. The Copy control briefly shows **Copied**. It uses the same style as the other result controls and does not add a status row. Press Enter to add a new line. Press `Cmd+Enter` to check the text immediately. Press `Cmd+Shift+Enter` to copy the Refine result. If only a grammar result is available, this shortcut copies that result. Arrow keys move the text cursor.

Press Escape to hide the window. Linloop continues to run. While you record a shortcut, Escape cancels shortcut recording. Clicking elsewhere, switching apps, and pressing the global shortcut again do not hide Linloop. To quit, right-click the Linloop icon in the macOS Dock and select **Quit**. Select the Dock icon or press the shortcut to open a hidden or closed window again.

For a dictionary result, select the word, its phonetic text (音标), or the speaker icon to hear the English pronunciation. Select the same control again to stop. This uses the built-in macOS voice and does not require a model server.

To change the keyboard shortcut:

1. Select the gear icon and open **Preferences**.
2. Select the shortcut field. Press a new key combination.
3. Select **Done**.

If the key combination is unavailable, the current shortcut stays active. To restore the default, select the reset arrow beside the shortcut, then **Done**. Move the pointer over the input to see the saved shortcut in a tooltip.

On macOS, allow Accessibility access if the system requests it for the global shortcut.

To move the window, drag the paper margin or a section heading. You can drag it between the Mac display and an extended display. An open hand shows where you can drag. A closed hand shows while you drag.

Select the gear icon to choose an installed model. Open **Preferences** for the shortcut, dictionary lookup option, or paper theme. Language detection is automatic for each input and for pronunciation. French input uses the selected local model and does not use the English dictionary or stored English word bank. Switch between English and French by writing in the other language. The input has no placeholder or trigger instructions below it.

French speech uses an installed French macOS voice. If no French voice is available, install one in macOS System Settings. English speech uses the system voice.

Linloop stores data in `linloop.sqlite` in the Electron `userData` directory.

## Run from source

Install [Bun](https://bun.sh). Set up local AI through settings as described above. Then run these commands from the repository directory:

```bash
bun install
bun start
```

To check the TypeScript code, run:

```bash
bun run typecheck
```

To check the input caret on launch, input focus during page loading and Dock activation, window focus, full-screen transitions, Escape, and native window controls, run `bun run verify:window`. To check Markdown rendering, source editing, paragraph input, the pause before results, matching fonts, scrolling, translations, copy feedback, and result controls in all three paper themes, run `bun run verify:results`. Run `bun run verify:translation` to check English and French translation recovery, automatic language detection, output replacement, dictionary bypass, and French copy controls through the full app with a local test server. These checks open temporary Electron windows and do not require an installed model. The window check temporarily opens a full-screen test window.

Run `bun run verify:language` to check native detection of English and French, short words, French without accents, Markdown, and language switches.

Run `bun run verify:local-ai` for official-library restrictions, runtime checksums, separate setup and download flows, and installed-model reuse. Run `bun run verify:resume` for interrupted downloads, ignored Range requests, incomplete extraction, and archive reuse after extraction failure. Run `bun run verify:reuse` to confirm that repeat initialization sends no pull request. Run `bun run verify:ai-settings` for compact layout, initialization progress and retry, independent model download and selection, and collapsed preferences. These checks use fixtures and do not download runtimes or models. The Mac release workflow runs type checks and the local AI, resume, and reuse checks before building the installer.

To check macOS speech, run the command below. It plays short speech samples. A model server is not necessary for this check.

```bash
bun run verify:speech
```

## Agent workflow

Matt Pocock’s engineering skills use GitHub Issues in `gameofby/linloop`, the default triage labels, and one root glossary with `docs/adr/` for decisions. See [AGENTS.md](AGENTS.md) and the configuration in [docs/agents](docs/agents).

## Build installers

Install the dependencies before you build an installer:

```bash
bun install
```

On macOS, run:

```bash
bun run dist:mac
```

The DMG file is `dist/Linloop-<version>-mac.dmg`.

### macOS build checks

The packaging hook in `scripts/sign-mac.cjs` applies ad-hoc signatures to the completed app and its nested code. The project uses electron-builder 25. This version does not support `mac.identity: "-"` directly. The hook supplies the ad-hoc signatures when `mac.identity` is `null`.

An ad-hoc signature does not identify a trusted developer. It does not supply Apple notarization. The release workflow also uses ad-hoc signatures. The `gatekeeperAssess: false` setting controls a build check only. It does not disable Gatekeeper on the user's Mac.

A valid DMG checksum does not prove that Gatekeeper will accept the app. To check a local build, run:

```bash
hdiutil verify "dist/Linloop-<version>-mac.dmg"
codesign --verify --deep --strict --verbose=2 dist/mac/Linloop.app
spctl --assess --type execute --verbose=4 dist/mac/Linloop.app
```

Replace `<version>` with the version in `package.json`. For an Apple Silicon build, use `dist/mac-arm64` instead of `dist/mac`. For a universal build, use `dist/mac-universal`. An ad-hoc build is expected to fail the `spctl` check, even if signature verification passes.

For a release that passes Gatekeeper, install a **Developer ID Application** certificate. Alternatively, supply `CSC_LINK` and `CSC_KEY_PASSWORD`. Supply these notarization credentials:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

With electron-builder 25, use these settings for the build:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=true bun run dist:mac \
  -c.mac.identity="YOUR NAME (TEAMID)" \
  -c.mac.hardenedRuntime=true -c.mac.notarize=true \
  -c.forceCodeSigning=true
```

Supply the same credentials and settings in the macOS release workflow before you publish a notarized release. Check the app with `codesign` and `spctl`. Check the attached notarization ticket with:

```bash
xcrun stapler validate path/to/Linloop.app
```

## Publish a release

Release versions use Git tags and `package.json`.

1. Use `patch` for each release. Use `minor` or `major` only when explicitly requested:

   ```bash
   bun run version:bump patch
   ```

   The script updates `package.json`, creates a commit, and creates an annotated tag.

2. Push the commit and the tag. Use the tag that the script prints:

   ```bash
   git push origin HEAD vX.Y.Z
   ```

   Replace `vX.Y.Z` with the exact tag printed by the version command.

A tag that matches `v*.*.*` starts the [release workflow](.github/workflows/release.yml). The workflow:

- Sets the `package.json` version from the tag.
- Builds a universal macOS app for Intel and Apple Silicon.
- Uploads the `.dmg` file directly to a draft GitHub Release.
- Publishes the release after the macOS build passes. A version with `-` is a prerelease.

To build a release manually, open **Actions → Release Builds → Run workflow**. The version input is optional. If it is empty, the workflow uses `package.json`.

Use `vX.Y.Z` tags for releases. Do not use `build-<sha>` tags.
