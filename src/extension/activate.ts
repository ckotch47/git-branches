import type { ExtensionContext } from "vscode";
import { registerExtensions } from "./registrations";

export function activate(context: ExtensionContext): void {
  registerExtensions(context);
}

export function deactivate(): void {}
