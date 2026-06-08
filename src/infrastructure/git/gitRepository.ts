import type { BranchRef } from "../../domain/branch";
import type { RepositoryContext } from "../../domain/repository";

export interface GitRepository {
  getRepositoryContext(rootPath: string): Promise<RepositoryContext | null>;
  getBranches(rootPath: string): Promise<BranchRef[]>;
  getRemotes(rootPath: string): Promise<string[]>;
}
