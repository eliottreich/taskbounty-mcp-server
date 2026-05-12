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

export function extractGithubToken(cloneUrl: string): string {
  const parsed = new URL(cloneUrl);
  if (parsed.hostname !== "github.com") {
    throw new Error("clone_url must point to github.com");
  }
  const token = decodeURIComponent(parsed.password || parsed.username);
  if (!token) {
    throw new Error("clone_url must include a GitHub installation token");
  }
  return token;
}

export function parseGithubRepo(repoUrl: string): { owner: string; repo: string } {
  const parsed = new URL(repoUrl);
  if (parsed.hostname !== "github.com") {
    throw new Error("repo_url must point to github.com");
  }

  const [owner, repoWithSuffix] = parsed.pathname
    .replace(/^\/+/, "")
    .split("/");
  const repo = repoWithSuffix?.replace(/\.git$/, "");

  if (!owner || !repo) {
    throw new Error("repo_url must include owner and repo");
  }

  return { owner, repo };
}

export function buildCreatePullRequestBody(args: CreateUpstreamPrArgs): Record<string, unknown> {
  const head = typeof args.head === "string" ? args.head.trim() : "";
  const base = typeof args.base === "string" && args.base.trim() ? args.base.trim() : "main";
  const title = typeof args.title === "string" ? args.title.trim() : "";

  if (!head) throw new Error("head is required");
  if (!title) throw new Error("title is required");

  return {
    title,
    head,
    base,
    ...(typeof args.body === "string" ? { body: args.body } : {}),
    maintainer_can_modify:
      typeof args.maintainer_can_modify === "boolean"
        ? args.maintainer_can_modify
        : true,
  };
}

function redactTokenUrl(value: string): string {
  return value.replace(
    /https:\/\/(?:x-access-token:)?[^@/]+@github\.com/g,
    "https://[redacted]@github.com",
  );
}

export async function createUpstreamPullRequest(args: CreateUpstreamPrArgs): Promise<ToolResult> {
  const cloneUrl = typeof args.clone_url === "string" ? args.clone_url : "";
  if (!cloneUrl) {
    return {
      content: [{ type: "text", text: "clone_url is required" }],
      isError: true,
    };
  }

  let token: string;
  let repo: { owner: string; repo: string };
  let body: Record<string, unknown>;

  try {
    token = extractGithubToken(cloneUrl);
    repo = parseGithubRepo(typeof args.repo_url === "string" ? args.repo_url : cloneUrl);
    body = buildCreatePullRequestBody(args);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: err instanceof Error ? redactTokenUrl(err.message) : String(err),
        },
      ],
      isError: true,
    };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/pulls`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
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

  const text = await res.text();
  if (!res.ok) {
    return {
      content: [{ type: "text", text: `HTTP ${res.status} ${res.statusText} from ${url}\n\n${text}` }],
      isError: true,
    };
  }

  return { content: [{ type: "text", text }] };
}
