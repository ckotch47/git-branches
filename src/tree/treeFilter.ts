import type { BranchRef } from "../domain/branch";
import { shortRemoteBranchName } from "./branchFormat";

export function normalizeFilter(input: string | undefined): string | null {
  const trimmed = (input ?? "").trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Current branch always passes so the user never loses orientation. */
export function matchesBranchFilter(branch: BranchRef, filter: string | null): boolean {
  if (!filter) {
    return true;
  }

  if (branch.isCurrent) {
    return true;
  }

  const haystack = branch.isRemote ? shortRemoteBranchName(branch.name) : branch.displayName;
  return haystack.toLowerCase().includes(filter.toLowerCase());
}
