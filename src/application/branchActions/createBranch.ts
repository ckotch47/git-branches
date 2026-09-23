import { runGit } from "../../infrastructure/git/gitCli";
import { assertValidBranchName } from "../../infrastructure/git/branchName";

export async function createBranch(rootPath: string, branchName: string): Promise<void> {
  await assertValidBranchName(rootPath, branchName);
  await runGit(rootPath, ["switch", "-c", branchName.trim()]);
}
