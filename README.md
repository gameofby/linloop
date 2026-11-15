# linloop

Learn English in a loop: write, refine, capture unknowns, use them again.

## Prototype

A local Electron overlay that behaves like Spotlight.

- Invoke with a hotkey (default `Ctrl/Cmd+Shift+L`). On macOS, Linloop shows over the current app or full-screen app without switching to the Desktop.
- Type an English sentence
- The output has a **Grammar correction** section and a **Refine** section
- Grammar corrects spelling and grammar. Refine gives alternatives biased toward stored words, 句型, and 常用搭配.
- Selecting a result copies it for paste
- On macOS, click the speaker icon beside the input or any suggestion to hear it pronounced. The icon changes to a stop square during playback. Playback uses the built-in macOS speech service and system voice, works offline, and stops when the overlay hides.
- macOS Dictionary handles a single word or fixed expression first. The app shows a concise dictionary entry with Chinese translations. If Dictionary has no entry, Linloop uses Ollama.
- Ollama streams directly into final-style cards in both output sections
- Refinement runs on a local Ollama model

English is the only target language in this PoC. No sync yet.

## Install

macOS: open the `.dmg` and drag **Linloop** into Applications.

Windows: run `Linloop-Setup-*.exe` and follow the installer (Start Menu and desktop shortcuts are created).

Local macOS builds use ad-hoc signing. They are not notarized, so downloaded copies can still be blocked by Gatekeeper. After trying to open a trusted copy, use **System Settings → Privacy & Security → Open Anyway** if macOS offers it.

```bash
bun install
bun run dist:mac    # dist/Linloop-*-mac.dmg
bun run dist:win    # dist/Linloop-Setup-*.exe (run on Windows)
```

### macOS “damaged” or blocked-app warnings

The original packaging configuration set `mac.identity` to `null`, which skips signing, and the release workflow disables certificate discovery. Renaming and repackaging Electron without signing the resulting bundle can leave missing or invalid signatures. Downloaded files also receive macOS quarantine metadata, which triggers Gatekeeper checks. A DMG can pass its checksum while the app inside is rejected.

The `scripts/sign-mac.cjs` packaging hook now signs the finished app and its nested code ad hoc and verifies the result. This hook supports the pinned electron-builder 25, which does not support `mac.identity: "-"` itself. This provides a verifiable bundle for local use; it does not establish a trusted developer identity or satisfy notarization. `gatekeeperAssess: false` only controls a build-time check; it does not disable Gatekeeper on the recipient’s Mac. The GitHub workflow currently produces these ad-hoc builds too.

Verify a local build with:

```bash
hdiutil verify dist/Linloop-0.1.0-mac.dmg
codesign --verify --deep --strict --verbose=2 dist/mac/Linloop.app
spctl --assess --type execute --verbose=4 dist/mac/Linloop.app
```

Use the actual version in the DMG filename and `dist/mac-arm64` for an Apple Silicon build. An ad-hoc build is expected to fail the `spctl` assessment even when signature verification passes.

For distribution that passes Gatekeeper, install a **Developer ID Application** certificate (or provide `CSC_LINK` and `CSC_KEY_PASSWORD`), and configure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization. With electron-builder 25, override the local signing settings:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=true bun run dist:mac \
  -c.mac.identity="YOUR NAME (TEAMID)" \
  -c.mac.hardenedRuntime=true -c.mac.notarize=true \
  -c.forceCodeSigning=true
```

Provide those credentials and use the same signing overrides in the macOS release workflow before publishing trusted releases. Verify the resulting app with `codesign` and `spctl`, and check its stapled notarization ticket with `xcrun stapler validate path/to/Linloop.app`. Ad-hoc signing alone cannot remove downloaded-app warnings.

## Run from source

1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull llama3.2`
2. From this repo:

```bash
bun install
bun start
```

To verify macOS pronunciation locally (plays short speech samples; no Ollama needed), run `bun run verify:speech`. Run `bun run typecheck` for TypeScript checks.

3. Press `Cmd+Shift+L` (macOS) or `Ctrl+Shift+L` (Windows/Linux), type, wait or press Enter.

Settings (gear): hotkey, Ollama host (`http://127.0.0.1:11434`), model name, and the macOS Dictionary-first option.

To change the hotkey, click its field and press a new key combination. Click **Save** to apply it. If the combination is unavailable, the current hotkey stays active. Use **Use default hotkey** to restore the default. The input hint shows the saved hotkey.

Drag the window by its bar padding or section headings. An open hand shows where you can drag. A closed hand shows while you drag.

macOS: allow Accessibility for the app so the global hotkey can register. If the named model is missing, the overlay lists models you already have.

SQLite file: Electron `userData` / `linloop.sqlite`.

## Releases

Releases are versioned with git tags and `package.json`.

1. Bump the app version, commit, and create an annotated tag:

```bash
bun run version:bump patch   # or minor | major
git push origin HEAD v0.1.1  # use the tag printed by the script
```

2. Pushing a tag matching `v*.*.*` runs [.github/workflows/release.yml](.github/workflows/release.yml):
   - Sets `package.json` version from the tag (so installers are named `Linloop-<version>-…`)
   - Builds a universal macOS (`.dmg`, Intel and Apple Silicon) app and a Windows (`.exe`) installer
   - Uploads installers directly to a draft GitHub Release, avoiding Actions artifact-storage quotas
   - Publishes the release after both builds succeed; versions containing `-` are prereleases

Manual rebuilds: Actions → **Release Builds** → **Run workflow** (optional version input; defaults to `package.json`).

Do not push bare `build-<sha>` tags for shipping builds; use `vX.Y.Z` only.
