import { runGit } from "../../infrastructure/git/gitCli";

export async function renameBranch(rootPath: string, oldBranchName: string, newBranchName: string): Promise<void> {
  await runGit(rootPath, ["branch", "-m", oldBranchName, newBranchName]);
}
