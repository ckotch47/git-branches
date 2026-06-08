import type { BranchRef } from "../../domain/branch";
import type { RepositoryContext } from "../../domain/repository";

export interface GitRepository {
  getRepositoryContext(): Promise<RepositoryContext | null>;
  getBranches(): Promise<BranchRef[]>;
}

