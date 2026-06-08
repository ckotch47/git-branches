import type { TreeSnapshot } from "../tree/treeModel";
import { commands } from "vscode";
import { contextKeys } from "../extension/context";

export async function updateContextKeys(snapshot: TreeSnapshot | null): Promise<void> {
  await commands.executeCommand("setContext", contextKeys.hasRepository, Boolean(snapshot));
  await commands.executeCommand("setContext", contextKeys.isEmptyState, snapshot?.state === "empty");
  await commands.executeCommand("setContext", contextKeys.isDetachedHead, snapshot?.state === "detached");
  await commands.executeCommand("setContext", contextKeys.canMerge, snapshot?.state === "normal");
  await commands.executeCommand("setContext", contextKeys.canRebase, snapshot?.state === "normal");
}
