# ADR: Terminal TUI

## Context

Git Branches already has a complete branch-management and read-only commit-graph workflow in its VS Code extension. The terminal interface is an additional UI for those existing operations; it must not introduce new Git behavior or persistent state.

## Decision

- Keep the TUI in this repository as the isolated `packages/tui` package.
- Reuse existing Git commands, branch actions, snapshot normalization, graph parsing/lanes, comparison helpers, and normalized errors from `src/`.
- Keep terminal rendering, input, clipboard, repository selection, and progress presentation in `packages/tui`.
- Keep TUI dependencies and output out of the VSIX. The VS Code extension keeps its existing entry point and behavior.
- Use the current working directory as the default workspace path; accept an explicit workspace path. Discover the workspace root and nested Git repositories using the extension's existing exclusions and result limit. When several repositories are found, require explicit selection and operate on one at a time.
- Persist no TUI state. Git remains the source of truth.

## Behavior parity

The TUI must preserve existing command availability, Git arguments, validation, confirmations, remote selection, auth retry, stash recovery, refresh, watcher, and error semantics. This includes branch creation/checkout/rename/delete, safe then force deletion, merged/gone cleanup previews, fetch/pull/push, merge/rebase/reset/abort, branch filtering/grouping, repository switching, and clipboard actions.

The graph remains read-only apart from the existing checkout action. It retains all/current/ref-focused views, lanes and ref badges, filtering, commit details and changed files, compare against current, per-file diffs, file-at-revision viewing, checkout, and copy actions.

Terminal prompts and views may use different controls and layout. They must not change the outcome or safety conditions of an existing action.

## Runtime

- The TUI package targets Node.js 20 or newer and owns its Ink/React dependencies.
- The package builds independently and is invoked from the repository root with `npm run tui -- [workspace-path]`.
- Non-interactive input is rejected with a clear message; terminal state is restored when the app exits or errors.

## Consequences

- The VS Code extension and TUI share the existing TypeScript Git and graph logic.
- VS Code-specific UI adapters are not imported by the TUI.
- Platform clipboard and terminal file/diff views are terminal adapters for the existing copy and inspect actions.
