export type RepoParseResult =
  | { ok: true; repo: string }
  | { ok: false; message: string };

export function parseGitHubRepo(raw: unknown): RepoParseResult {
  const repoRaw = String(raw ?? "").trim();
  if (!repoRaw) {
    return { ok: false, message: "repo is required (owner/name or a GitHub URL)" };
  }

  const match = repoRaw.match(
    /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
  );
  if (!match) {
    return {
      ok: false,
      message: `Could not parse repo "${repoRaw}". Use owner/name or a full GitHub URL.`,
    };
  }

  return { ok: true, repo: `${match[1]}/${match[2]}` };
}
