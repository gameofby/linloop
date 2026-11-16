Always follow ASD-STE100 with technical sessions.

For changes to user-visible behavior, supported platforms, installation, builds, or releases:

1. Update `README.md` and `README.zh-CN.md` in the same change. Keep their instructions consistent.
2. Check both files against the implementation, `package.json`, and the release workflow. Check features, controls, platform support, commands, and download names.
3. Use version placeholders for examples that must remain valid across releases. Explain how to replace each placeholder.
4. Before a release commit, tag, or push, review the README diff against the release changes. Complete the documentation updates before publication. Release notes do not replace README updates.

## Agent skills

### Issue tracker

Use GitHub Issues in `gameofby/linloop` for issues, specs, and tickets. Read `docs/agents/issue-tracker.md` before tracker operations.

### Triage labels

Use the five default triage labels. Read `docs/agents/triage-labels.md` before triage or label changes.

### Domain docs

Use one root `GLOSSARY.md` and `docs/adr/`. Read `docs/agents/domain.md` before codebase exploration or domain changes.
