import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";
import { checkoutBranch } from "./checkoutBranch";
import { ensureCleanWorkingTree } from "../../infrastructure/git/workingTree";

export async function checkoutAndRebaseOntoBranch(
  rootPath: string,
  sourceBranchName: string,
  targetBranch: BranchRef,
): Promise<void> {
  await ensureCleanWorkingTree(rootPath);
  await checkoutBranch(rootPath, targetBranch);

  if (sourceBranchName === targetBranch.name) {
    return;
  }

  await runGit(rootPath, ["rebase", targetBranch.name, sourceBranchName]);
}
