import type { BranchRef } from "../domain/branch";
import type { BranchState } from "../domain/branchState";

export interface TreeSnapshot {
  repositoryRoot: string;
  branches: BranchRef[];
  currentBranch?: string | null;
  state: BranchState;
}
