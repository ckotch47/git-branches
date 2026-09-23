import { BranchManagerError } from "../../domain/errors";
import { runGit } from "./gitCli";

export async function assertValidBranchName(rootPath: string, name: string): Promise<void> {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new BranchManagerError("Branch name cannot be empty.", "invalid_branch_name");
  }

  try {
    await runGit(rootPath, ["check-ref-format", "--branch", trimmed]);
  } catch {
    throw new BranchManagerError(
      `"${name}" is not a valid Git branch name. Avoid spaces, ~, ^, :, ?, *, [, and leading dots or slashes.`,
      "invalid_branch_name",
    );
  }
}
