export function normalizeGitHubRepo(repoRaw: string): string | null {
  const repo = repoRaw.trim();
  if (!repo) return null;

  const match = repo.match(
    /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
  );
  if (!match) return null;

  return `${match[1]}/${match[2]}`;
}
