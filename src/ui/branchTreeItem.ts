import { TreeItem, TreeItemCollapsibleState } from "vscode";

export class BranchTreeItem extends TreeItem {
  constructor(label: string) {
    super(label, TreeItemCollapsibleState.None);
  }
}
