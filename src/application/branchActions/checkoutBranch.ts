import { runGit } from "../../infrastructure/git/gitCli";
import type { BranchRef } from "../../domain/branch";
import { ensureCleanWorkingTree } from "../../infrastructure/git/workingTree";

async function localBranchExists(rootPath: string, branchName: string): Promise<boolean> {
  try {
    await runGit(rootPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
}

export async function checkoutBranch(rootPath: string, branch: BranchRef): Promise<void> {
  await ensureCleanWorkingTree(rootPath);

  if (branch.isRemote) {
    const localName = branch.name.split("/").slice(1).join("/");

    if (await localBranchExists(rootPath, localName)) {
      await runGit(rootPath, ["switch", localName]);
      return;
    }

    await runGit(rootPath, ["switch", "--track", "-c", localName, branch.name]);
    return;
  }

  await runGit(rootPath, ["switch", branch.name]);
}
