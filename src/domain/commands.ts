export type BranchCommand =
  | "refresh"
  | "fetchRemotes"
  | "checkout"
  | "createBranch"
  | "createBranchFromSelected"
  | "copyBranchName"
  | "deleteBranch"
  | "renameBranch"
  | "pull"
  | "push"
  | "mergeIntoCurrent"
  | "rebaseCurrentOntoSelected"
  | "checkoutAndRebaseOntoSelected";
