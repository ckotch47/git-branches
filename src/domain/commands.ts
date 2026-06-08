export type BranchCommand =
  | "refresh"
  | "checkout"
  | "createBranch"
  | "deleteBranch"
  | "pull"
  | "push"
  | "mergeIntoCurrent"
  | "rebaseCurrentOntoSelected";
