import { BranchManagerError } from "../../domain/errors";

export function normalizeGitError(error: unknown): BranchManagerError {
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

  return new BranchManagerError(message, "git_error", details || undefined);
}
