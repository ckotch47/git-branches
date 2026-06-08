import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";

export async function createBranchFromBranch(
  rootPath: string,
  sourceBranch: BranchRef,
  newBranchName: string,
): Promise<void> {
  if (sourceBranch.isRemote) {
    await runGit(rootPath, ["switch", "--track", "-c", newBranchName, sourceBranch.name]);
    return;
  }

  await runGit(rootPath, ["switch", "-c", newBranchName, sourceBranch.name]);
}
