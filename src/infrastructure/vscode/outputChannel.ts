import { window } from "vscode";

const outputChannel = window.createOutputChannel("Branch Manager");

export function logOutput(message: string): void {
  outputChannel.appendLine(message);
}
