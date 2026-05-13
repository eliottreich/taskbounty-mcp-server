type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type CreateUpstreamPrArgs = {
  clone_url?: unknown;
  repo_url?: unknown;
  head?: unknown;
  base?: unknown;
  title?: unknown;
  body?: unknown;
  maintainer_can_modify?: unknown;
};

export function extractInstallationToken(cloneUrl: string): string {
  const parsed = new URL(cloneUrl);

  if (parsed.hostname !== "github.com") {
    throw new Error("clone_url must be a github.com HTTPS URL");
  }

  const token = parsed.password || parsed.username;
  if (!token) {
    throw new Error("clone_url must include a GitHub installation token");
  }

  return decodeURIComponent(token);
}

export function parseGithubRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const parsed = new URL(repoUrl);

  if (parsed.hostname !== "github.com") {
    throw new Error("repo_url must be a github.com URL");
  }

  const [owner, rawRepo] = parsed.pathname.replace(/^\/+/, "").split("/");
  const repo = rawRepo?.replace(/\.git$/, "");

  if (!owner || !repo) {
    throw new Error("repo_url must include both owner and repo");
  }

  return { owner, repo };
}

export function buildCreatePullRequestPayload(args: CreateUpstreamPrArgs): Record<string, unknown> {
  const head = typeof args.head === "string" ? args.head.trim() : "";
  const title = typeof args.title === "string" ? args.title.trim() : "";
  const base = typeof args.base === "string" && args.base.trim() ? args.base.trim() : "main";

  if (!head) {
    throw new Error("head is required");
  }
  if (!title) {
    throw new Error("title is required");
  }

  return {
    title,
    head,
    base,
    ...(typeof args.body === "string" ? { body: args.body } : {}),
    maintainer_can_modify:
      typeof args.maintainer_can_modify === "boolean" ? args.maintainer_can_modify : true,
  };
}

function redactGithubToken(value: string): string {
  return value.replace(
    /https:\/\/(?:x-access-token:)?[^@/\s]+@github\.com/g,
    "https://[redacted]@github.com",
  );
}

export async function createUpstreamPullRequest(args: CreateUpstreamPrArgs): Promise<ToolResult> {
  const cloneUrl = typeof args.clone_url === "string" ? args.clone_url.trim() : "";
  if (!cloneUrl) {
    return {
      content: [{ type: "text", text: "clone_url is required" }],
      isError: true,
    };
  }

  let token: string;
  let repo: { owner: string; repo: string };
  let payload: Record<string, unknown>;

  try {
    token = extractInstallationToken(cloneUrl);
    repo = parseGithubRepoUrl(typeof args.repo_url === "string" ? args.repo_url : cloneUrl);
    payload = buildCreatePullRequestPayload(args);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: redactGithubToken(err instanceof Error ? err.message : String(err)),
        },
      ],
      isError: true,
    };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/pulls`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return {
      content: [
        {
          type: "text",
          text: redactGithubToken(`HTTP ${response.status} ${response.statusText} from ${url}\n\n${text}`),
        },
      ],
      isError: true,
    };
  }

  return { content: [{ type: "text", text }] };
}
