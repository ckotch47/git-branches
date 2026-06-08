export async function withProgress<T>(task: () => Promise<T>): Promise<T> {
  return task();
}

