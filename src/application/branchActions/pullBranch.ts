import { runGit } from "../../infrastructure/git/gitCli";

export async function pullBranch(
  rootPath: string,
  branchName: string,
  remoteName = "origin",
  isCurrent = false,
): Promise<void> {
  if (isCurrent) {
    await runGit(rootPath, ["pull"]);
    return;
  }

  await runGit(rootPath, ["fetch", remoteName, `${branchName}:${branchName}`]);
}
