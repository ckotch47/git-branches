export class BranchManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "BranchManagerError";
  }
}
