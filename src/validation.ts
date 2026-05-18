export function normalizeGitHubRepoInput(value: unknown): string | null {
  const repoRaw = String(value ?? "").trim();
  if (!repoRaw) return null;

  const match = repoRaw.match(
    /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

export function firstMissingRequiredArg(
  args: Record<string, unknown>,
  required: readonly string[],
): string | undefined {
  return required.find((key) => {
    const value = args[key];
    return value === undefined || value === null || value === "";
  });
}
