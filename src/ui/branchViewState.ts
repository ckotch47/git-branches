import type { RepositoryContext } from "../domain/repository";

export interface BranchViewState {
  repositoryId?: string;
  repository: RepositoryContext | null;
}
