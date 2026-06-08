import type { RepositoryContext } from "../domain/repository";
import type { GitRepository } from "../infrastructure/git/gitRepository";
import type { TreeSnapshot } from "./treeModel";

export async function buildSnapshot(
  gitRepository: GitRepository,
  repository: RepositoryContext,
): Promise<TreeSnapshot> {
  const branches = await gitRepository.getBranches(repository.rootPath);
  const currentBranch = branches.find((branch) => branch.isCurrent)?.name ?? null;
  const state =
    branches.length === 0 ? "empty" : currentBranch ? "normal" : "detached";

  return {
    repositoryRoot: repository.rootPath,
    branches,
    currentBranch,
    state,
  };
}
