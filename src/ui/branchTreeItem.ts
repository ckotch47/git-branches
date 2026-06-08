import { ThemeIcon, TreeItem, TreeItemCollapsibleState } from "vscode";
import type { BranchRef } from "../domain/branch";

export type BranchTreeItemType = "root" | "group" | "remoteGroup" | "branch" | "message";

export class BranchTreeItem extends TreeItem {
  constructor(
    label: string,
    public readonly itemType: BranchTreeItemType,
    public readonly branch?: BranchRef,
    public readonly remoteName?: string,
  ) {
    super(
      label,
      itemType === "branch" || itemType === "message"
        ? TreeItemCollapsibleState.None
        : TreeItemCollapsibleState.Collapsed,
    );

    if (itemType === "root") {
      this.contextValue = "branchManager.root";
      this.iconPath = new ThemeIcon("folder");
    } else if (itemType === "group" || itemType === "remoteGroup") {
      this.contextValue = "branchManager.group";
      this.iconPath = new ThemeIcon("folder-opened");
    } else if (itemType === "message") {
      this.contextValue = "branchManager.message";
      this.iconPath = new ThemeIcon("info");
    } else if (branch?.isRemote) {
      this.contextValue = "branchManager.branch branchManager.remoteBranch";
      this.iconPath = new ThemeIcon("git-branch");
    } else if (branch?.isCurrent) {
      this.contextValue =
        "branchManager.branch branchManager.localBranch branchManager.currentBranch";
      this.iconPath = new ThemeIcon("check");
    } else {
      this.contextValue =
        "branchManager.branch branchManager.localBranch branchManager.nonCurrentBranch";
      this.iconPath = new ThemeIcon("git-branch");
    }
  }
}
