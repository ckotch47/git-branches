import { runGit } from "../../infrastructure/git/gitCli";

export async function pushBranch(
  rootPath: string,
  branchName: string,
  remoteName = "origin",
): Promise<void> {
  await runGit(rootPath, ["push", remoteName, branchName]);
}
