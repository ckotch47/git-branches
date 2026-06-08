import { BranchManagerError } from "../../domain/errors";

export function normalizeGitError(message: string): BranchManagerError {
  return new BranchManagerError(message, "git_error");
}

