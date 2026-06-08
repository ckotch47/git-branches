import { ProgressLocation, window } from "vscode";

export async function withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task,
  );
}
