# Domain documentation

This repository has one domain context.

## Before codebase exploration

- Read the root `GLOSSARY.md` for domain terms, if it exists.
- Read relevant decisions in `docs/adr/`, if that directory exists.
- If these documents are absent, continue without creating empty files.

## During domain work

Use the terms defined in `GLOSSARY.md` for code, issues, hypotheses, and tests. If a term conflicts with the glossary, resolve the difference before changing it.

Use the `domain-modeling` skill to record terms as they are resolved. Create `GLOSSARY.md` only when there is a term to record. Create `docs/adr/` only when there is a decision to record. Keep implementation details out of the glossary.

If a proposed change conflicts with an existing ADR, identify the conflict and its reason. Resolve it explicitly before implementation.
