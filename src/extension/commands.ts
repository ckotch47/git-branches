export const commandIds = {
  refresh: "branchManager.refresh",
  checkout: "branchManager.checkout",
  createBranch: "branchManager.createBranch",
  deleteBranch: "branchManager.deleteBranch",
  pull: "branchManager.pull",
  push: "branchManager.push",
  mergeIntoCurrent: "branchManager.mergeIntoCurrent",
  rebaseCurrentOntoSelected: "branchManager.rebaseCurrentOntoSelected",
} as const;
