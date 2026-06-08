import { runGit } from "../../infrastructure/git/gitCli";

export async function deleteBranch(rootPath: string, branchName: string): Promise<void> {
  await runGit(rootPath, ["branch", "-d", branchName]);
}
