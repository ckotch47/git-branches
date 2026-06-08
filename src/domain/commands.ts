export type BranchCommand =
  | "refresh"
  | "checkout"
  | "createBranch"
  | "deleteBranch"
  | "pull"
  | "push"
  | "compareWithCurrent"
  | "mergeIntoCurrent"
  | "rebaseCurrentOntoSelected";

