export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type RepoParseResult =
  | { ok: true; repo: string }
  | { ok: false; result: ToolResult };

export function toolError(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

export function parseGitHubRepo(raw: unknown): RepoParseResult {
  const repoRaw = String(raw ?? "").trim();
  if (!repoRaw) {
    return { ok: false, result: toolError("repo is required (owner/name or a GitHub URL)") };
  }

  const match = repoRaw.match(
    /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
  );
  if (!match) {
    return {
      ok: false,
      result: toolError(`Could not parse repo "${repoRaw}". Use owner/name or a full GitHub URL.`),
    };
  }

  return { ok: true, repo: `${match[1]}/${match[2]}` };
}
