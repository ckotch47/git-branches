import { runGit } from "../../infrastructure/git/gitCli";

export async function pushBranch(
  rootPath: string,
  branchName: string,
  remoteName = "origin",
  sshPassphrase?: string,
  setUpstream = false,
): Promise<void> {
  const args = setUpstream
    ? ["push", "--set-upstream", remoteName, branchName]
    : ["push", remoteName, branchName];
  await runGit(rootPath, args, { sshPassphrase });
}
