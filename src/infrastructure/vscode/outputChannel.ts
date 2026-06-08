import { window } from "vscode";

const outputChannel = window.createOutputChannel("Git Branches");

export function logOutput(message: string): void {
  outputChannel.appendLine(message);
}
