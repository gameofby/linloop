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

## Run

1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull llama3.2`
2. From this repo:

```bash
npm install
npm start
```

3. Press `Cmd+Shift+L` (macOS) or `Ctrl+Shift+L` (Windows/Linux), type, wait or press Enter.

Settings (gear): hotkey, Ollama host (`http://127.0.0.1:11434`), model name.

macOS: allow Accessibility for the app so the global hotkey can register. If the named model is missing, the overlay lists models you already have.

SQLite file: Electron `userData` / `linloop.sqlite`.
