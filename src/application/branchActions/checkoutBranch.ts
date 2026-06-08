import { runGit } from "../../infrastructure/git/gitCli";
import type { BranchRef } from "../../domain/branch";

export async function checkoutBranch(rootPath: string, branch: BranchRef): Promise<void> {
  if (branch.isRemote) {
    const localName = branch.name.split("/").slice(1).join("/");
    await runGit(rootPath, ["switch", "--track", "-c", localName, branch.name]);
    return;
  }

  await runGit(rootPath, ["switch", branch.name]);
}
