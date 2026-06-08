import { runGit } from "../../infrastructure/git/gitCli";

export async function pullBranch(
  rootPath: string,
  branchName: string,
  remoteName = "origin",
  isCurrent = false,
  sshPassphrase?: string,
): Promise<void> {
  if (isCurrent) {
    await runGit(rootPath, ["pull"], { sshPassphrase });
    return;
  }

  await runGit(rootPath, ["fetch", remoteName, `${branchName}:${branchName}`], { sshPassphrase });
}
