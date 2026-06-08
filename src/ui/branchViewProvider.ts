import type { Event, TreeDataProvider, TreeItem } from "vscode";
import { EventEmitter } from "vscode";
import { BranchTreeItem } from "./branchTreeItem";

export class BranchViewProvider implements TreeDataProvider<BranchTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new EventEmitter<void | BranchTreeItem | BranchTreeItem[] | null | undefined>();

  readonly onDidChangeTreeData: Event<void | BranchTreeItem | BranchTreeItem[] | null | undefined> =
    this.onDidChangeTreeDataEmitter.event;

  getTreeItem(element: BranchTreeItem): TreeItem {
    return element;
  }

  getChildren(): BranchTreeItem[] {
    return [];
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }
}
