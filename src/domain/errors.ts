export class BranchManagerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "BranchManagerError";
  }
}

