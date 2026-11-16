# Issue tracker: GitHub

Issues, specs, and tickets live in GitHub Issues at https://github.com/gameofby/linloop. Use the `gh` CLI from this repository.

## Operations

- Check the target before the first write: `gh repo view --json nameWithOwner`. It must be `gameofby/linloop`.
- Create an issue: `gh issue create --repo gameofby/linloop --title "..." --body-file <body-file>`. Write multiline text to a file first. Replace `<body-file>` with its path.
- Read an issue: `gh issue view <number> --repo gameofby/linloop --json number,title,body,labels,comments`.
- List issues: `gh issue list --repo gameofby/linloop --state open --json number,title,body,labels`. Add label filters as needed.
- Comment: `gh issue comment <number> --repo gameofby/linloop --body-file <body-file>`.
- Apply or remove labels: `gh issue edit <number> --repo gameofby/linloop --add-label "..."` or `--remove-label "..."`.
- Close an issue: post its outcome with the comment command, then use `gh issue close <number> --repo gameofby/linloop`.

Replace `<number>` with the issue number. Use `docs/agents/triage-labels.md` for triage label names. File issues only in this repository, including when the skills came from another repository.

## Parent issues and blockers

Use native GitHub sub-issues and dependencies. Create a child with `gh issue create --repo gameofby/linloop --parent <parent-number> ...`. Add a blocker with `gh issue edit <number> --repo gameofby/linloop --add-blocked-by <blocker-number>`.

Replace the number placeholders with issue numbers. If those features are unavailable, put `Part of #<parent-number>` or `Blocked by: #<blocker-number>` at the top of the issue body. Work can start when all blockers are closed.

## Skill requests

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, read the GitHub issue.

## Pull requests as a triage surface

**PRs as a request surface: no.**
