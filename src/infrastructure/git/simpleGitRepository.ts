import type { GitRepository } from "./gitRepository";

export class SimpleGitRepository implements GitRepository {
  async getRepositoryContext() {
    throw new Error("Not implemented");
  }

  async getBranches() {
    throw new Error("Not implemented");
  }
}

