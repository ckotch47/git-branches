import { BranchManagerError } from "../../domain/errors";
import { runGit } from "./gitCli";

export async function ensureCleanWorkingTree(rootPath: string): Promise<void> {
  const output = await runGit(rootPath, ["status", "--porcelain"]);

  if (output.trim().length > 0) {
    throw new BranchManagerError(
      "Working tree has unstaged or uncommitted changes. Commit or stash them first.",
      "git_dirty_worktree",
    );
  }
}
