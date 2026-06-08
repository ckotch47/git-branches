export function parseGitOutput(output: string): string[] {
  return output.split("\n").filter(Boolean);
}

