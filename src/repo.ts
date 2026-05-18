export function normalizeGitHubRepo(repoRaw: unknown): string | null {
  const repo = String(repoRaw ?? "").trim();
  if (!repo) return null;

  const match = repo.match(
    /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
  );
  if (!match) return null;

  return `${match[1]}/${match[2]}`;
}
