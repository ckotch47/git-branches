import { BranchManagerError } from "../../domain/errors";
import { runGit } from "../../infrastructure/git/gitCli";

export function isNotFullyMergedError(error: unknown): boolean {
  const text =
    error instanceof BranchManagerError
      ? `${error.message}\n${error.details ?? ""}`
      : error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
  return /not fully merged/i.test(text);
}

export async function deleteBranch(rootPath: string, branchName: string, force = false): Promise<void> {
  await runGit(rootPath, ["branch", force ? "-D" : "-d", branchName]);
}
