import type { GitRepository } from "./gitRepository";
import type { BranchRef } from "../../domain/branch";
import type { RepositoryContext } from "../../domain/repository";

export class SimpleGitRepository implements GitRepository {
  async getRepositoryContext(): Promise<RepositoryContext | null> {
    throw new Error("Not implemented");
  }

  async getBranches(): Promise<BranchRef[]> {
    throw new Error("Not implemented");
  }
}
