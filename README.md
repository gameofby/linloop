# linloop

Learn English in a loop: write, refine, capture unknowns, use them again.

## Prototype

A local Electron overlay that behaves like Spotlight.

- Invoke with a hotkey (default `Ctrl/Cmd+Shift+L`)
- Type an English sentence
- **Grammar**: correct grammar/spelling only
- **Refine**: rewrite with a few options, biased toward stored words, 句型, and 常用搭配
- Selecting a result copies it for paste
- After refine, choose which new items to save into local SQLite
- Refinement runs on a local Ollama model

English is the only target language in this PoC. No sync yet.

## Install

macOS: open the `.dmg` and drag **Linloop** into Applications.

Windows: run `Linloop-Setup-*.exe` and follow the installer (Start Menu and desktop shortcuts are created).

Unsigned local builds: on macOS, right-click the app and choose Open the first time.

```bash
bun install
bun run dist:mac    # dist/Linloop-*-mac.dmg
bun run dist:win    # dist/Linloop-Setup-*.exe (run on Windows)
```

## Run from source

1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull llama3.2`
2. From this repo:

```bash
bun install
bun start
```

3. Press `Cmd+Shift+L` (macOS) or `Ctrl+Shift+L` (Windows/Linux), type, wait or press Enter.

Settings (gear): hotkey, Ollama host (`http://127.0.0.1:11434`), model name.

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
   - Builds macOS (`.dmg`) and Windows (`.exe`) artifacts
   - Creates or updates the GitHub Release for that tag and uploads the installers

Manual rebuilds: Actions → **Release Builds** → **Run workflow** (optional version input; defaults to `package.json`).

Do not push bare `build-<sha>` tags for shipping builds; use `vX.Y.Z` only.
