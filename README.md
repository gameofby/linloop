<p align="center">
  <img src="build/icon.png" width="112" height="112" alt="Linloop icon">
</p>

<h1 align="center">Linloop</h1>

<p align="center">Write English. Correct mistakes. Use what you learn.</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

Linloop is a desktop app for English practice. Use a keyboard shortcut to open a small window above your current app. Enter a sentence to get corrections and other ways to write it. Linloop uses a local [Ollama](https://ollama.com) model.

This project is a prototype. It supports English practice only. It does not synchronize data between devices.

## Features

- **Grammar correction:** Correct spelling and grammar.
- **Refine:** Get other ways to write a sentence. The model uses stored words, sentence patterns, and common word combinations as context.
- **Results as they arrive:** Read each result while the model generates it.
- **Copy results:** Select a result to copy it. Then paste it into another app.
- **macOS Dictionary:** Look up a word or fixed expression first. Read a short entry with Chinese translations. If no entry is available, Linloop uses Ollama.
- **macOS speech:** Select the speaker icon beside the input or a result to hear it. Speech uses the system voice and works without a network connection. Select the stop icon to stop speech. Speech also stops when the window closes or hides.
- **Window access:** Open the window with `Cmd+Shift+L` on macOS or `Ctrl+Shift+L` on Windows and Linux. On macOS, the window can appear above a full-screen app.

## Install

Download an installer from [GitHub Releases](https://github.com/gameofby/linloop/releases).

| System | Instructions |
| --- | --- |
| macOS | Open the `.dmg` file. Drag **Linloop** into **Applications**. |
| Windows | Run `Linloop-Setup-*.exe`. Follow the installer instructions. The installer adds Start Menu and desktop shortcuts. |

For sentence corrections, install Ollama and download a model. See [Set up Ollama](#set-up-ollama).

The macOS builds use ad-hoc signatures. They do not have Apple notarization. Gatekeeper can block a downloaded copy. If you trust the copy, try to open it. Then use **System Settings → Privacy & Security → Open Anyway**, if available. See [macOS build checks](#macos-build-checks) for more information.

## Set up Ollama

1. Install [Ollama](https://ollama.com).
2. Start Ollama.
3. Download the default model:

   ```bash
   ollama pull llama3.2
   ```

Linloop uses `http://127.0.0.1:11434` and `llama3.2` by default. To use a different host or model, select the gear icon and change the settings. If the selected model is missing, Linloop lists the installed models.

## Use Linloop

1. Start Linloop.
2. Press `Cmd+Shift+L` on macOS or `Ctrl+Shift+L` on Windows and Linux.
3. Enter an English sentence. Wait for the **Grammar correction** and **Refine** results.
4. Select a result to copy it. Paste it into your target app.

Use the Up and Down arrow keys to select a **Refine** result. Press Enter to copy the selected result. If only a grammar result is available, Enter copies that result. Press Escape to hide the window.

To change the keyboard shortcut:

1. Select the gear icon.
2. Select the shortcut field. Press a new key combination.
3. Select **Save**.

If the key combination is unavailable, the current shortcut stays active. To restore the default, select **Use default hotkey**, then **Save**. The input hint shows the saved shortcut.

On macOS, allow Accessibility access if the system requests it for the global shortcut.

To move the window, drag an empty area of the top bar or a section heading. An open hand shows where you can drag. A closed hand shows while you drag.

Select the gear icon to change the Ollama host, model, dictionary lookup option, or theme.

Linloop stores data in `linloop.sqlite` in the Electron `userData` directory.

## Run from source

Install [Bun](https://bun.sh). Set up Ollama as described above. Then run these commands from the repository directory:

```bash
bun install
bun start
```

To check the TypeScript code, run:

```bash
bun run typecheck
```

To check macOS speech, run the command below. It plays short speech samples. Ollama is not necessary for this check.

```bash
bun run verify:speech
```

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

On Windows, run:

```bash
bun run dist:win
```

The installer is `dist/Linloop-Setup-<version>.exe`.

### macOS build checks

The packaging hook in `scripts/sign-mac.cjs` applies ad-hoc signatures to the completed app and its nested code. The project uses electron-builder 25. This version does not support `mac.identity: "-"` directly. The hook supplies the ad-hoc signatures when `mac.identity` is `null`.

An ad-hoc signature does not identify a trusted developer. It does not supply Apple notarization. The release workflow also uses ad-hoc signatures. The `gatekeeperAssess: false` setting controls a build check only. It does not disable Gatekeeper on the user's Mac.

A valid DMG checksum does not prove that Gatekeeper will accept the app. To check a local build, run:

```bash
hdiutil verify dist/Linloop-0.1.0-mac.dmg
codesign --verify --deep --strict --verbose=2 dist/mac/Linloop.app
spctl --assess --type execute --verbose=4 dist/mac/Linloop.app
```

Replace `0.1.0` with the build version. For an Apple Silicon build, use `dist/mac-arm64` instead of `dist/mac`. An ad-hoc build is expected to fail the `spctl` check, even if signature verification passes.

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

1. Run the version command. Use `patch`, `minor`, or `major` as necessary:

   ```bash
   bun run version:bump patch
   ```

   The script updates `package.json`, creates a commit, and creates an annotated tag.

2. Push the commit and the tag. Use the tag that the script prints:

   ```bash
   git push origin HEAD v0.1.1
   ```

A tag that matches `v*.*.*` starts the [release workflow](.github/workflows/release.yml). The workflow:

- Sets the `package.json` version from the tag.
- Builds a universal macOS app for Intel and Apple Silicon, and a Windows installer.
- Uploads the `.dmg` and `.exe` files directly to a draft GitHub Release.
- Publishes the release after both builds pass. A version with `-` is a prerelease.

To build a release manually, open **Actions → Release Builds → Run workflow**. The version input is optional. If it is empty, the workflow uses `package.json`.

Use `vX.Y.Z` tags for releases. Do not use `build-<sha>` tags.
