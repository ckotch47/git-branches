import { runGit } from "../../infrastructure/git/gitCli";

export async function createBranch(rootPath: string, branchName: string): Promise<void> {
  await runGit(rootPath, ["switch", "-c", branchName]);
}
