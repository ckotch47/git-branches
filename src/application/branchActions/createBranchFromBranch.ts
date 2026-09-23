import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";
import { assertValidBranchName } from "../../infrastructure/git/branchName";

export async function createBranchFromBranch(
  rootPath: string,
  sourceBranch: BranchRef,
  newBranchName: string,
): Promise<void> {
  await assertValidBranchName(rootPath, newBranchName);
  const name = newBranchName.trim();

  if (sourceBranch.isRemote) {
    await runGit(rootPath, ["switch", "--track", "-c", name, sourceBranch.name]);
    return;
  }

  await runGit(rootPath, ["switch", "-c", name, sourceBranch.name]);
}
