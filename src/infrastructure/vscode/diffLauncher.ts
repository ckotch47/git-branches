import { commands, workspace, Uri } from "vscode";

export async function openDiffView(
  title: string,
  leftLabel: string,
  leftContent: string,
  rightLabel: string,
  rightContent: string,
): Promise<void> {
  const left = await workspace.openTextDocument({
    content: leftContent,
    language: "markdown",
  });
  const right = await workspace.openTextDocument({
    content: rightContent,
    language: "markdown",
  });

  await commands.executeCommand(
    "vscode.diff",
    left.uri ?? Uri.parse(`untitled:${leftLabel}`),
    right.uri ?? Uri.parse(`untitled:${rightLabel}`),
    title,
  );
}
