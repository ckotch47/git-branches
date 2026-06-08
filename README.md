# Git Branches

Git Branches is a VS Code extension for branch-centric Git workflows.

It focuses on branch management inside the built-in **Source Control** view, so you can work with branches without switching to a separate Git UI.

## Where to find it

Open VS Code and go to:

- **Source Control** sidebar
- **Branches** view

If the current workspace contains multiple Git repositories, the extension will ask you to pick one.

## What it does

The extension provides:

- refresh branch data
- fetch all remotes
- checkout branches
- create new branches
- create a branch from the selected branch
- rename branches
- delete branches
- pull and push
- merge into current branch
- rebase current branch onto a selected branch
- checkout and rebase onto a selected branch
- copy branch name

## Usage

1. Open a folder that contains a Git repository.
2. Open **Source Control**.
3. Find the **Branches** view.
4. Use the toolbar buttons or the branch context menu.

Common actions:

- `Refresh` updates the branch tree.
- `Fetch All Remotes` updates remote branch refs.
- `Checkout` switches to the selected branch.
- `Pull` and `Push` operate on the selected local branch or the current branch.
- `Merge into Current` and `Rebase Current onto Selected` work on branch items that are valid for those actions.
- `Copy Branch Name` copies the branch name to the clipboard.

## Requirements

- VS Code 1.85 or newer
- Git installed and available on the PATH
- SSH credentials configured if the repository uses SSH remotes

## Development

```bash
npm install
npm run build
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Notes

- The extension does not keep persistent branch state.
- The branch tree is built from Git and the current VS Code workspace context.
- Remote branch refs are grouped by remote name.
