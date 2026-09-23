import { BranchManagerError } from "../../domain/errors";

export function normalizeGitError(error: unknown): BranchManagerError {
  // Domain errors already carry an actionable code — keep them as-is.
  if (error instanceof BranchManagerError && error.code && error.code !== "git_error") {
    return error;
  }

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Git operation failed";
  const details =
    error instanceof BranchManagerError
      ? error.details
      : error && typeof error === "object" && "details" in error
        ? String((error as { details?: unknown }).details ?? "")
        : "";

  const authSource = `${message}\n${details}`;
  if (/permission denied|publickey|passphrase|authentication failed|agent/i.test(authSource)) {
    return new BranchManagerError(
      "Git authentication failed. Check SSH key or passphrase.",
      "git_auth_error",
      details || message,
    );
  }

  if (/no upstream|upstream.*not|set-upstream|--set-upstream|has no upstream/i.test(authSource)) {
    return new BranchManagerError(
      "No upstream configured for this branch. Push with --set-upstream or publish the branch first.",
      "git_no_upstream",
      details || message,
    );
  }

  if (/not fully merged/i.test(authSource)) {
    return new BranchManagerError(
      "Branch is not fully merged. Use force delete to discard its commits.",
      "git_not_fully_merged",
      details || message,
    );
  }

  if (/no merge in progress|no rebase in progress/i.test(authSource)) {
    return new BranchManagerError(
      "Nothing to abort: no merge or rebase is in progress.",
      "git_nothing_to_abort",
      details || message,
    );
  }

  if (/stash/i.test(authSource) && /conflict|error/i.test(authSource)) {
    return new BranchManagerError(
      "Stash pop conflicted. Your changes are kept in the stash — resolve manually.",
      "git_stash_conflict",
      details || message,
    );
  }

  return new BranchManagerError(message, "git_error", details || undefined);
}
