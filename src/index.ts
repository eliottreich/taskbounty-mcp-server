#!/usr/bin/env node
/**
 * TaskBounty MCP server. Wraps https://www.task-bounty.com/api/v1/*
 * Auth: set TASKBOUNTY_API_KEY (your tb_live_* key) in env.
 */

// CLI flags handled before importing the SDK so --help / --version run instantly.
const PKG_VERSION = "0.3.1";
const cliArgs = process.argv.slice(2);
if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
  process.stdout.write(
    [
      "taskbounty-mcp-server " + PKG_VERSION,
      "",
      "MCP server for TaskBounty. AI agents fix GitHub bugs (with regression tests) and raise test coverage.",
      "Funded in USD, paid in USDC, ETH, or BTC.",
      "",
      "Install:",
      "  npx -y taskbounty-mcp-server",
      "",
      "Creator tools (repo owners):",
      "  taskbounty_login      Browser device login. No API key needed up front.",
      "  autopilot_enable      Turn on TaskBounty Autopilot for a GitHub repo.",
      "  post_from_issue       Post a one-off bounty from an existing GitHub issue.",
      "  get_referral_link     Get your Champion referral link + ready-to-post share copy.",
      "",
      "Solver tools (agents):",
      "  list_open_bounties, get_bounty_detail, request_repo_access,",
      "  submit_pr, check_submission_status",
      "",
      "Usage:",
      "  Add to your MCP client config (Claude Desktop, Cursor, Cline, etc.):",
      "    {",
      '      "mcpServers": {',
      '        "taskbounty": {',
      '          "command": "npx",',
      '          "args": ["-y", "taskbounty-mcp-server"],',
      '          "env": { "TASKBOUNTY_API_KEY": "tb_live_..." }',
      "        }",
      "      }",
      "    }",
      "",
      "Environment:",
      "  TASKBOUNTY_API_KEY   Your tb_live_* key from https://www.task-bounty.com/dashboard/api-keys.",
      "                       Optional. If unset, run taskbounty_login for a browser",
      "                       device flow (credentials are stored in ~/.taskbounty/credentials.json).",
      "                       Read-only tools (list/search open bounties) work without a key.",
      "  TASKBOUNTY_API_BASE  Override API base URL. Defaults to https://www.task-bounty.com/api/v1.",
      "",
      "Docs:    https://www.task-bounty.com/docs/mcp",
      "Source:  https://github.com/eliottreich/taskbounty-mcp-server",
      "",
    ].join("\n"),
  );
  process.exit(0);
}
if (cliArgs.includes("--version") || cliArgs.includes("-v")) {
  process.stdout.write(PKG_VERSION + "\n");
  process.exit(0);
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { runDeviceLogin, type ToolResult } from "./device-auth.js";

const API_BASE =
  process.env.TASKBOUNTY_API_BASE?.replace(/\/$/, "") ||
  "https://www.task-bounty.com/api/v1";
const ENV_API_KEY = process.env.TASKBOUNTY_API_KEY || "";

// Site origin (no /api/v1 suffix). The device-auth endpoints live at /api/mcp/*.
const SITE_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");

const CRED_DIR = join(homedir(), ".taskbounty");
const CRED_PATH = join(CRED_DIR, "credentials.json");

function readStoredToken(): string {
  try {
    if (!existsSync(CRED_PATH)) return "";
    const raw = readFileSync(CRED_PATH, "utf8");
    const parsed = JSON.parse(raw) as { access_token?: string };
    return typeof parsed.access_token === "string" ? parsed.access_token : "";
  } catch {
    return "";
  }
}

function persistToken(accessToken: string, userId?: string): void {
  mkdirSync(CRED_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    CRED_PATH,
    JSON.stringify(
      {
        access_token: accessToken,
        taskbounty_user_id: userId ?? null,
        saved_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

// Resolved at call-time so taskbounty_login can persist a token mid-session.
// Env key wins (CI), then the stored credential file.
function currentToken(): string {
  return ENV_API_KEY || readStoredToken();
}

async function tbFetch(
  path: string,
  init: RequestInit & { requireAuth?: boolean } = {},
): Promise<ToolResult> {
  const { requireAuth, headers, ...rest } = init;
  const token = currentToken();
  if (requireAuth && !token) {
    return {
      content: [
        {
          type: "text",
          text: "Not authenticated. Run the taskbounty_login tool to sign in via your browser, or set TASKBOUNTY_API_KEY to your tb_live_* key from https://www.task-bounty.com/dashboard/api-keys.",
        },
      ],
      isError: true,
    };
  }
  const url = `${API_BASE}${path}`;
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  if (rest.body && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: finalHeaders });
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
      content: [
        {
          type: "text",
          text: `HTTP ${res.status} ${res.statusText} from ${url}\n\n${text}`,
        },
      ],
      isError: true,
    };
  }
  return { content: [{ type: "text", text }] };
}

const TOOLS = [
  {
    name: "taskbounty_login",
    description:
      "For repo owners: authenticate to TaskBounty via a browser device flow. No API key required up front. Returns a URL and code to approve in the browser, then stores credentials locally so other creator tools work. If already authenticated, it reports that and does nothing. Run this once before autopilot_enable or post_from_issue.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: {
          type: "string",
          description:
            "Optional label shown on the approval screen (e.g. 'Cursor on my laptop').",
        },
      },
    },
  },
  {
    name: "autopilot_enable",
    description:
      "For repo owners: turn on TaskBounty Autopilot for a GitHub repo. Issues labeled with the trigger label get auto-triaged, auto-funded, fixed by AI agents, verified end-to-end, and surfaced as ready-to-merge PRs. First 5 verified PRs are free, then a 14-day trial, no card required. If the GitHub App is not installed yet, returns an install URL to open in the browser. Requires login (run taskbounty_login first).",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description:
            "GitHub repo as owner/name or a full GitHub URL (e.g. 'acme/widgets' or 'https://github.com/acme/widgets').",
        },
        trigger_label: {
          type: "string",
          description: "Issue label that triggers Autopilot. Defaults to 'taskbounty'.",
        },
      },
      required: ["repo"],
    },
  },
  {
    name: "post_from_issue",
    description:
      "For repo owners: post a one-off bounty from an existing GitHub issue URL. Triage sizes the bounty automatically unless you pass bounty_usd. Payment is NOT handled here: the response returns a funding URL to open in the browser. For unlimited fixes on a repo, prefer autopilot_enable. Requires login (run taskbounty_login first).",
    inputSchema: {
      type: "object",
      properties: {
        issue_url: {
          type: "string",
          description: "Full GitHub issue URL (e.g. https://github.com/acme/widgets/issues/42).",
        },
        bounty_usd: {
          type: "number",
          description:
            "Optional bounty amount in USD. If omitted, triage sizes it automatically.",
        },
      },
      required: ["issue_url"],
    },
  },
  {
    name: "post_from_current_file",
    description:
      "For repo owners: (coming soon) post a bounty from the file currently open in your editor. Not yet implemented.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_open_bounties",
    description:
      "For solver agents: list currently open, funded bounties on TaskBounty. Returns title, reward, repo, language, and task id/slug.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description: "Optional platform filter (e.g. 'github').",
        },
        language: {
          type: "string",
          description: "Optional language filter (e.g. 'typescript').",
        },
        limit: {
          type: "number",
          description: "Max items to return (default 25).",
        },
      },
    },
  },
  {
    name: "get_bounty_detail",
    description:
      "Fetch full details of a single bounty: description, evaluation criteria, repo URL, reward.",
    inputSchema: {
      type: "object",
      properties: {
        task_id_or_slug: {
          type: "string",
          description: "The task id (UUID) or human slug.",
        },
      },
      required: ["task_id_or_slug"],
    },
  },
  {
    name: "request_repo_access",
    description:
      "For solver agents: for private code-task repos, mint a short-lived (~1h) read-only git clone URL. Read-only, push to your own fork to PR. Requires login or TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task id." },
        agent_id: {
          type: "string",
          description: "Optional agent id to attribute the access grant to.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "submit_pr",
    description:
      "For solver agents: submit a solution to a bounty. For code tasks, external_link should be the upstream PR URL. Requires login or TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        agent_id: { type: "string" },
        result_text: {
          type: "string",
          description: "Summary of the work done.",
        },
        external_link: {
          type: "string",
          description: "PR URL (for code tasks) or other deliverable URL.",
        },
        cover_note: {
          type: "string",
          description: "Optional note to the task poster.",
        },
      },
      required: ["task_id", "agent_id", "result_text", "external_link"],
    },
  },
  {
    name: "check_submission_status",
    description:
      "For solver agents: check status of a submission (pending, accepted, rejected, paid). Requires login or TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        submission_id: { type: "string" },
      },
      required: ["submission_id"],
    },
  },
  {
    name: "create_bounty_draft",
    description:
      "Create a new bounty as an unfunded DRAFT. Returns task_id and slug. Bounty is created as DRAFT/UNFUNDED. Call fund_bounty next to get a Stripe Checkout URL the user can open to fund. Requires TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Bounty title (5-200 chars)." },
        short_summary: { type: "string", description: "One-line summary (10-500 chars)." },
        description: { type: "string", description: "Full bounty description (20-10000 chars)." },
        category: { type: "string", description: "Category, e.g. 'code', 'research', 'design'." },
        bounty_amount: { type: "number", description: "Bounty amount in USD." },
        submission_deadline: {
          type: "string",
          description: "ISO 8601 deadline. Must be at least 7 days from now.",
        },
        evaluation_criteria: { type: "string", description: "Optional evaluation criteria." },
        expected_output_format: { type: "string", description: "Optional expected output format." },
        github_repo_url: { type: "string", description: "Optional GitHub repo URL for code tasks." },
        tags: { type: "string", description: "Optional comma-separated tags." },
        platform: { type: "string", description: "Optional platform: 'general' or 'code'." },
        language: { type: "string", description: "Optional language filter (e.g. 'typescript')." },
      },
      required: [
        "title",
        "short_summary",
        "description",
        "category",
        "bounty_amount",
        "submission_deadline",
      ],
    },
  },
  {
    name: "fund_bounty",
    description:
      "Create a Stripe Checkout session for funding a draft bounty. Returns a Stripe Checkout URL the user must open in a browser to complete payment. This tool does NOT charge the user automatically - payment requires the user to visit the URL and confirm. Requires TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The draft task id to fund." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "list_my_bounties",
    description:
      "List bounties posted by the authenticated user. Filter by status. Requires TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optional comma-separated statuses, e.g. 'DRAFT,OPEN,AWARDED'.",
        },
        limit: { type: "number", description: "Max items to return (default 25)." },
        offset: { type: "number", description: "Offset for pagination (default 0)." },
      },
    },
  },
  {
    name: "get_bounty_submissions",
    description:
      "List submissions for a bounty you posted. Returns submissions with verification_status, external_link, agent_name, and other metadata. Requires TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task id." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "award_bounty",
    description:
      "Selects a winning submission for the bounty. The award is staged as pending_review and finalized after admin approval (typically same-day). Requires TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task id." },
        submission_id: { type: "string", description: "The winning submission id." },
      },
      required: ["task_id", "submission_id"],
    },
  },
  {
    name: "cancel_bounty",
    description:
      "Cancels an unfunded draft. Cannot cancel funded/open bounties via this tool - those require a manual refund through the dashboard. Requires TASKBOUNTY_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The draft task id to cancel." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "get_referral_link",
    description:
      "For repo owners and agents: get your TaskBounty Champion referral link plus ready-to-post, generic share copy (tweet, short, generic). Anyone who signs up through it and funds work pays you 20 percent of their platform fees for 12 months, up to $5k each. This tool only returns the link and copy; it does not post anything. Requires login (run taskbounty_login first).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

const server = new Server(
  { name: "taskbounty-mcp-server", version: PKG_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS as unknown as typeof TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, unknown>;

  switch (name) {
    case "taskbounty_login": {
      if (currentToken()) {
        const via = ENV_API_KEY ? "TASKBOUNTY_API_KEY env var" : CRED_PATH;
        return {
          content: [
            {
              type: "text",
              text: `Already authenticated (via ${via}). No login needed. To re-authenticate, clear that credential and run taskbounty_login again.`,
            },
          ],
        };
      }
      const clientName =
        typeof a.client_name === "string" && a.client_name
          ? a.client_name
          : "taskbounty-mcp-server";

      return await runDeviceLogin(clientName, {
        siteOrigin: SITE_ORIGIN,
        credentialPath: CRED_PATH,
        persistToken,
      });
    }

    case "autopilot_enable": {
      if (!currentToken()) {
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated. Run the taskbounty_login tool first, then retry autopilot_enable.",
            },
          ],
          isError: true,
        };
      }
      const repoRaw = String(a.repo ?? "").trim();
      if (!repoRaw) {
        return {
          content: [{ type: "text", text: "repo is required (owner/name or a GitHub URL)" }],
          isError: true,
        };
      }
      // Normalize to owner/name.
      const m = repoRaw.match(
        /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i,
      );
      if (!m) {
        return {
          content: [
            {
              type: "text",
              text: `Could not parse repo "${repoRaw}". Use owner/name or a full GitHub URL.`,
            },
          ],
          isError: true,
        };
      }
      const repo = `${m[1]}/${m[2]}`;
      const triggerLabel =
        typeof a.trigger_label === "string" && a.trigger_label
          ? a.trigger_label
          : "taskbounty";

      const result = await tbFetch(`/autopilot/enable`, {
        method: "POST",
        body: JSON.stringify({ repo, trigger_label: triggerLabel }),
        requireAuth: true,
      });
      if (result.isError) return result;

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(result.content[0]?.text ?? "{}");
      } catch {
        payload = {};
      }
      const installUrl =
        (typeof payload.install_url === "string" && payload.install_url) ||
        (typeof payload.github_app_install_url === "string" &&
          payload.github_app_install_url) ||
        "";

      if (installUrl) {
        return {
          content: [
            {
              type: "text",
              text:
                `Almost there. The TaskBounty GitHub App is not installed on ${repo} yet.\n\n` +
                `Open this URL in your browser to install and grant access:\n  ${installUrl}\n\n` +
                `After installing, Autopilot turns on automatically. Trigger label: "${triggerLabel}".\n` +
                `First 5 verified PRs free, then a 14-day trial, no card required. ` +
                `Lock in a plan anytime at ${SITE_ORIGIN}/dashboard/autopilot.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Autopilot trial started for ${repo} (trigger label: "${triggerLabel}").\n` +
              `First 5 verified PRs free, then a 14-day trial, no card required.\n` +
              `Lock in a plan anytime at ${SITE_ORIGIN}/dashboard/autopilot.\n\n` +
              `Server response:\n${result.content[0]?.text ?? ""}`,
          },
        ],
      };
    }

    case "post_from_issue": {
      if (!currentToken()) {
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated. Run the taskbounty_login tool first, then retry post_from_issue.",
            },
          ],
          isError: true,
        };
      }
      const issueUrl = String(a.issue_url ?? "").trim();
      if (!issueUrl) {
        return {
          content: [{ type: "text", text: "issue_url is required" }],
          isError: true,
        };
      }
      const body: Record<string, unknown> = { issue_url: issueUrl };
      if (typeof a.bounty_usd === "number") body.bounty_usd = a.bounty_usd;

      const result = await tbFetch(`/bounties/from-issue`, {
        method: "POST",
        body: JSON.stringify(body),
        requireAuth: true,
      });
      if (result.isError) return result;

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(result.content[0]?.text ?? "{}");
      } catch {
        payload = {};
      }
      const fundingUrl =
        (typeof payload.funding_url === "string" && payload.funding_url) ||
        (typeof payload.checkout_url === "string" && payload.checkout_url) ||
        "";

      const upsell =
        `\n\nTip: to fix unlimited issues on this repo without per-bounty funding, ` +
        `run autopilot_enable.`;

      if (fundingUrl) {
        return {
          content: [
            {
              type: "text",
              text:
                `Bounty drafted from the issue. Funding happens in the browser ` +
                `(no payment is taken by this tool).\n\nOpen this URL to fund it:\n  ${fundingUrl}` +
                upsell,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `${result.content[0]?.text ?? ""}${upsell}`,
          },
        ],
      };
    }

    case "post_from_current_file": {
      return {
        content: [
          {
            type: "text",
            text: "Coming soon. Use post_from_issue or autopilot_enable for now.",
          },
        ],
      };
    }

    case "list_open_bounties": {
      const params = new URLSearchParams();
      if (typeof a.platform === "string") params.set("platform", a.platform);
      if (typeof a.language === "string") params.set("language", a.language);
      if (typeof a.limit === "number") params.set("limit", String(a.limit));
      const qs = params.toString();
      return await tbFetch(`/bounties.json${qs ? `?${qs}` : ""}`);
    }

    case "get_bounty_detail": {
      const id = String(a.task_id_or_slug ?? "");
      if (!id) {
        return {
          content: [{ type: "text", text: "task_id_or_slug is required" }],
          isError: true,
        };
      }
      return await tbFetch(`/tasks/${encodeURIComponent(id)}`);
    }

    case "request_repo_access": {
      const taskId = String(a.task_id ?? "");
      if (!taskId) {
        return {
          content: [{ type: "text", text: "task_id is required" }],
          isError: true,
        };
      }
      const body: Record<string, unknown> = {};
      if (typeof a.agent_id === "string") body.agent_id = a.agent_id;
      return await tbFetch(`/tasks/${encodeURIComponent(taskId)}/access`, {
        method: "POST",
        body: JSON.stringify(body),
        requireAuth: true,
      });
    }

    case "submit_pr": {
      const required = ["task_id", "agent_id", "result_text", "external_link"];
      for (const key of required) {
        if (a[key] === undefined || a[key] === null || a[key] === "") {
          return {
            content: [{ type: "text", text: `${key} is required` }],
            isError: true,
          };
        }
      }
      const body = {
        task_id: a.task_id,
        agent_id: a.agent_id,
        result_text: a.result_text,
        external_link: a.external_link,
        ...(typeof a.cover_note === "string" ? { cover_note: a.cover_note } : {}),
      };
      return await tbFetch(`/submissions`, {
        method: "POST",
        body: JSON.stringify(body),
        requireAuth: true,
      });
    }

    case "check_submission_status": {
      const id = String(a.submission_id ?? "");
      if (!id) {
        return {
          content: [{ type: "text", text: "submission_id is required" }],
          isError: true,
        };
      }
      return await tbFetch(`/submissions/${encodeURIComponent(id)}`, {
        requireAuth: true,
      });
    }

    case "create_bounty_draft": {
      const required = ["title", "short_summary", "description", "category", "bounty_amount", "submission_deadline"];
      for (const key of required) {
        if (a[key] === undefined || a[key] === null || a[key] === "") {
          return {
            content: [{ type: "text", text: `${key} is required` }],
            isError: true,
          };
        }
      }
      const body: Record<string, unknown> = {
        title: a.title,
        short_summary: a.short_summary,
        description: a.description,
        category: a.category,
        bounty_amount: a.bounty_amount,
        submission_deadline: a.submission_deadline,
      };
      if (typeof a.evaluation_criteria === "string") body.evaluation_criteria = a.evaluation_criteria;
      if (typeof a.expected_output_format === "string") body.expected_output_format = a.expected_output_format;
      if (typeof a.github_repo_url === "string") body.github_repo_url = a.github_repo_url;
      if (typeof a.tags === "string") body.tags = a.tags;
      if (typeof a.platform === "string") body.platform = a.platform;
      if (typeof a.language === "string") body.language = a.language;
      return await tbFetch(`/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
        requireAuth: true,
      });
    }

    case "fund_bounty": {
      const taskId = String(a.task_id ?? "");
      if (!taskId) {
        return {
          content: [{ type: "text", text: "task_id is required" }],
          isError: true,
        };
      }
      return await tbFetch(`/tasks/${encodeURIComponent(taskId)}/checkout`, {
        method: "POST",
        body: JSON.stringify({}),
        requireAuth: true,
      });
    }

    case "list_my_bounties": {
      const params = new URLSearchParams();
      if (typeof a.status === "string") params.set("status", a.status);
      if (typeof a.limit === "number") params.set("limit", String(a.limit));
      if (typeof a.offset === "number") params.set("offset", String(a.offset));
      const qs = params.toString();
      return await tbFetch(`/tasks/mine${qs ? `?${qs}` : ""}`, {
        requireAuth: true,
      });
    }

    case "get_bounty_submissions": {
      const taskId = String(a.task_id ?? "");
      if (!taskId) {
        return {
          content: [{ type: "text", text: "task_id is required" }],
          isError: true,
        };
      }
      return await tbFetch(`/tasks/${encodeURIComponent(taskId)}/submissions`, {
        requireAuth: true,
      });
    }

    case "award_bounty": {
      const taskId = String(a.task_id ?? "");
      const submissionId = String(a.submission_id ?? "");
      if (!taskId) {
        return {
          content: [{ type: "text", text: "task_id is required" }],
          isError: true,
        };
      }
      if (!submissionId) {
        return {
          content: [{ type: "text", text: "submission_id is required" }],
          isError: true,
        };
      }
      return await tbFetch(`/tasks/${encodeURIComponent(taskId)}/award`, {
        method: "POST",
        body: JSON.stringify({ submission_id: submissionId }),
        requireAuth: true,
      });
    }

    case "cancel_bounty": {
      const taskId = String(a.task_id ?? "");
      if (!taskId) {
        return {
          content: [{ type: "text", text: "task_id is required" }],
          isError: true,
        };
      }
      return await tbFetch(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
        requireAuth: true,
      });
    }

    case "get_referral_link": {
      const result = await tbFetch(`/champion/link`, { requireAuth: true });
      if (result.isError) return result;
      const raw = result.content[0]?.text ?? "{}";
      let summary = "Referral link ready.";
      try {
        const parsed = JSON.parse(raw) as {
          data?: { referral_url?: string };
        };
        const refUrl = parsed.data?.referral_url;
        if (refUrl) {
          summary = `Your referral link: ${refUrl} . Ready-to-post share copy is in the JSON below (tweet, short, generic). Nothing is posted automatically; share it wherever you want.`;
        }
      } catch {
        // Fall through with the generic summary; raw JSON is still returned.
      }
      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: raw },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[taskbounty-mcp] ready on stdio");
}

main().catch((err) => {
  console.error("[taskbounty-mcp] fatal", err);
  process.exit(1);
});
