import { BranchManagerError } from "../../domain/errors";
import { runGit } from "./gitCli";

export async function isWorkingTreeDirty(rootPath: string): Promise<boolean> {
  const output = await runGit(rootPath, ["status", "--porcelain"]);
  return output.trim().length > 0;
}

export async function ensureCleanWorkingTree(rootPath: string): Promise<void> {
  if (await isWorkingTreeDirty(rootPath)) {
    throw new BranchManagerError(
      "Working tree has unstaged or uncommitted changes. Commit or stash them first.",
      "git_dirty_worktree",
    );
  }
}

/** Stash uncommitted changes. Returns true when something was stashed. */
export async function stashPush(rootPath: string): Promise<boolean> {
  if (!(await isWorkingTreeDirty(rootPath))) {
    return false;
  }

  // -u: status --porcelain treats untracked files as dirty,
  // so the stash must take them too, otherwise the tree stays dirty.
  await runGit(rootPath, ["stash", "push", "-u", "-m", "branch-manager: auto-stash"]);
  return true;
}

export async function stashPop(rootPath: string): Promise<void> {
  await runGit(rootPath, ["stash", "pop"]);
}
