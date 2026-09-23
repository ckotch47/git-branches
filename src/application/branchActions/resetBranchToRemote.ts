import { BranchManagerError } from "../../domain/errors";
import type { BranchRef } from "../../domain/branch";
import { runGit } from "../../infrastructure/git/gitCli";
import { ensureCleanWorkingTree } from "../../infrastructure/git/workingTree";

export function resolveRemoteRef(branch: BranchRef): { remoteName: string; remoteRef: string } {
  if (branch.upstream) {
    const remoteName = branch.upstream.split("/")[0] || "origin";
    return { remoteName, remoteRef: branch.upstream };
  }

  const remoteName = branch.remoteName || "origin";
  return { remoteName, remoteRef: `${remoteName}/${branch.name}` };
}

async function headBranchName(rootPath: string): Promise<string | null> {
  try {
    const name = (await runGit(rootPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    return name && name !== "HEAD" ? name : null;
  } catch {
    return null;
  }
}
async function remoteRefExists(rootPath: string, remoteRef: string): Promise<boolean> {
  try {
    await runGit(rootPath, ["show-ref", "--verify", "--quiet", `refs/remotes/${remoteRef}`]);
    return true;
  } catch {
    return false;
  }
}

export async function resetBranchToRemote(
  rootPath: string,
  branch: BranchRef,
  sshPassphrase?: string,
): Promise<{ remoteRef: string }> {
  if (branch.isRemote) {
    throw new BranchManagerError("Cannot reset a remote branch. Select a local branch instead.", "branch_invalid_target");
  }

  const { remoteName, remoteRef } = resolveRemoteRef(branch);
  const isCurrent = branch.isCurrent || (await headBranchName(rootPath)) === branch.name;

  if (isCurrent) {
    await ensureCleanWorkingTree(rootPath);
  }

  await runGit(rootPath, ["fetch", remoteName, "--prune"], { sshPassphrase });

  if (!(await remoteRefExists(rootPath, remoteRef))) {
    throw new BranchManagerError(
      `Remote branch "${remoteRef}" not found. Fetch latest remotes and try again.`,
      "branch_remote_not_found",
    );
  }

  if (isCurrent) {
    await runGit(rootPath, ["reset", "--hard", remoteRef]);
  } else {
    await runGit(rootPath, ["branch", "-f", branch.name, remoteRef]);
  }

  return { remoteRef };
}
