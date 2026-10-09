# Git Branches TUI

Requires Node.js 20 or newer. The TUI dependencies are isolated in this package and do not become dependencies of the VS Code extension.

From the repository root, install the `git-b` command once:

```sh
npm install --prefix packages/tui
npm --prefix packages/tui run build
npm --prefix packages/tui link
```

Run it from any Git workspace, or pass a workspace path:

```sh
git-b [workspace-path]
```

Omit `workspace-path` to discover Git repositories under the current directory. When multiple repositories are found, the TUI asks which one to use. The root `npm run tui -- [workspace-path]` shortcut remains available for development.

Use the arrow keys to move between branches and panes, `Enter` to check out/open the selected item, `Tab` to open grouped actions, type to search action menus, and `Esc` to go back or exit. Text input works with any keyboard layout. The graph supports all/current/ref-focused views, commit details, comparison with the current branch, file content and diff viewing, checkout, and clipboard actions.
