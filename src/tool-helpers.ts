export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type RepoParseResult =
  | { ok: true; repo: string }
  | { ok: false; result: ToolResult };

export type UpstreamIssueReference = {
  repo: string;
  number: number;
  issueUrl: string;
};

export type TaskCompetitionState = {
  upstreamCommentsCount: number;
  linkedSubmissionCount: number;
  duplicateRisk: "low" | "medium" | "high" | "unknown";
  solverHint: "good_to_attempt" | "inspect_first" | "likely_saturated";
  upstreamIssueUrl?: string;
  note?: string;
};

const SUBMISSION_PATTERNS = [
  /submitted\s+(?:pr|pull request)\s*#?\d+/i,
  /opened\s+(?:pr|pull request)\s*#?\d+/i,
  /\/pull\/\d+/i,
  /\/attempt\b/i,
  /\/claim\b/i,
];

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

export function parseUpstreamIssueReference(
  title: string,
  text: string,
  url?: string,
): UpstreamIssueReference | undefined {
  const haystack = `${title}\n${text}\n${url ?? ""}`;

  const githubIssueUrl = haystack.match(
    /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/i,
  );
  if (githubIssueUrl) {
    const repo = `${githubIssueUrl[1]}/${githubIssueUrl[2]}`;
    const number = Number.parseInt(githubIssueUrl[3], 10);
    return {
      repo,
      number,
      issueUrl: `https://github.com/${repo}/issues/${number}`,
    };
  }

  const proseIssueRef = haystack.match(
    /issue\s+#(\d+)\s+in\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i,
  );
  if (proseIssueRef) {
    const repo = proseIssueRef[2].replace(/[.,;:)]+$/, "");
    const number = Number.parseInt(proseIssueRef[1], 10);
    return {
      repo,
      number,
      issueUrl: `https://github.com/${repo}/issues/${number}`,
    };
  }

  return undefined;
}

export function summarizeTaskCompetition(
  comments: string[],
  upstreamIssueUrl?: string,
): TaskCompetitionState {
  const linkedSubmissionCount = comments.filter((comment) =>
    SUBMISSION_PATTERNS.some((pattern) => pattern.test(comment)),
  ).length;

  const duplicateRisk =
    linkedSubmissionCount >= 2
      ? "high"
      : linkedSubmissionCount === 1
        ? "medium"
        : "low";
  const solverHint =
    duplicateRisk === "high"
      ? "likely_saturated"
      : duplicateRisk === "medium"
        ? "inspect_first"
        : "good_to_attempt";

  return {
    upstreamCommentsCount: comments.length,
    linkedSubmissionCount,
    duplicateRisk,
    solverHint,
    ...(upstreamIssueUrl ? { upstreamIssueUrl } : {}),
  };
}

export function unknownTaskCompetition(note: string): TaskCompetitionState {
  return {
    upstreamCommentsCount: 0,
    linkedSubmissionCount: 0,
    duplicateRisk: "unknown",
    solverHint: "inspect_first",
    note,
  };
}
