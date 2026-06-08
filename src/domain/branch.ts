export type BranchKind = "local" | "remote" | "head";

export interface BranchRef {
  name: string;
  displayName: string;
  kind: BranchKind;
  isCurrent: boolean;
  isRemote: boolean;
  remoteName?: string;
  ahead?: number;
  behind?: number;
  lastCommitMessage?: string;
  lastCommitDate?: Date;
}

