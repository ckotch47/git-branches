export type BranchCommand =
  | "refresh"
  | "fetchRemotes"
  | "checkout"
  | "createBranch"
  | "deleteBranch"
  | "pull"
  | "push"
  | "mergeIntoCurrent"
  | "rebaseCurrentOntoSelected";
