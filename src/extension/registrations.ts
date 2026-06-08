import type { ExtensionContext } from "vscode";
import { commands, window } from "vscode";
import { commandIds } from "./commands";
import { BranchViewProvider } from "../ui/branchViewProvider";

export function registerExtensions(context: ExtensionContext): void {
  const provider = new BranchViewProvider();

  context.subscriptions.push(
    window.createTreeView("branchManager.view", {
      treeDataProvider: provider,
      showCollapseAll: true,
    }),
    window.createTreeView("branchManager.scmView", {
      treeDataProvider: provider,
      showCollapseAll: true,
    }),
  );

  for (const commandId of Object.values(commandIds)) {
    context.subscriptions.push(
      commands.registerCommand(commandId, () => {
        void commandId;
      }),
    );
  }
}
