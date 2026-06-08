import { TreeItem, TreeItemCollapsibleState } from "vscode";
import type { BranchRef } from "../domain/branch";

export type BranchTreeItemType = "root" | "group" | "branch" | "message";

export class BranchTreeItem extends TreeItem {
  constructor(
    label: string,
    public readonly itemType: BranchTreeItemType,
    public readonly branch?: BranchRef,
  ) {
    super(
      label,
      itemType === "branch" || itemType === "message"
        ? TreeItemCollapsibleState.None
        : TreeItemCollapsibleState.Collapsed,
    );

    if (itemType === "root") {
      this.contextValue = "branchManager.root";
    } else if (itemType === "group") {
      this.contextValue = "branchManager.group";
    } else if (itemType === "message") {
      this.contextValue = "branchManager.message";
    } else if (branch?.isRemote) {
      this.contextValue = "branchManager.branch branchManager.remoteBranch";
    } else if (branch?.isCurrent) {
      this.contextValue =
        "branchManager.branch branchManager.localBranch branchManager.currentBranch";
    } else {
      this.contextValue =
        "branchManager.branch branchManager.localBranch branchManager.nonCurrentBranch";
    }
  }
}
