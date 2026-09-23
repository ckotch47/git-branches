import { runGit } from "../../infrastructure/git/gitCli";
import { assertValidBranchName } from "../../infrastructure/git/branchName";

export async function renameBranch(rootPath: string, oldBranchName: string, newBranchName: string): Promise<void> {
  await assertValidBranchName(rootPath, newBranchName);
  await runGit(rootPath, ["branch", "-m", oldBranchName, newBranchName.trim()]);
}
