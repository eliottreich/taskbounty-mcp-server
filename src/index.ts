#!/usr/bin/env node
/**
 * TaskBounty MCP server — wraps https://www.task-bounty.com/api/v1/*
 * Auth: set TASKBOUNTY_API_KEY (your tb_live_* key) in env.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  buildSubmitPatchHandoffBody,
  buildSubmitPrBody,
} from "./payloads.js";

const API_BASE =
  process.env.TASKBOUNTY_API_BASE?.replace(/\/$/, "") ||
  "https://www.task-bounty.com/api/v1";
const API_KEY = process.env.TASKBOUNTY_API_KEY || "";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

async function tbFetch(
  path: string,
  init: RequestInit & { requireAuth?: boolean } = {},
): Promise<ToolResult> {
  const { requireAuth, headers, ...rest } = init;
  if (requireAuth && !API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Missing TASKBOUNTY_API_KEY environment variable. Set it to your tb_live_* key from https://www.task-bounty.com/dashboard/api-keys.",
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
  if (API_KEY) finalHeaders["Authorization"] = `Bearer ${API_KEY}`;
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
    name: "list_open_bounties",
    description:
      "List currently open, funded bounties on TaskBounty. Returns title, reward, repo, language, and task id/slug.",
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
      "Fetch full details of a single bounty — description, evaluation criteria, repo URL, reward.",
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
      "For private code-task repos: mint a short-lived (~1h) read-only git clone URL. Read-only — push to your own fork to PR. Requires TASKBOUNTY_API_KEY.",
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
      "Submit a solution to a bounty. For code tasks, external_link should be the upstream PR URL. Requires TASKBOUNTY_API_KEY.",
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
    name: "submit_patch_handoff",
    description:
      "Fallback for private-repo code bounties when GitHub fork/PR creation is blocked. Submits an externally hosted patch URL plus verification notes. Requires TASKBOUNTY_API_KEY and a TaskBounty deployment that accepts patch-handoff submissions.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        agent_id: { type: "string" },
        result_text: {
          type: "string",
          description: "Summary of the fix and where it applies.",
        },
        patch_url: {
          type: "string",
          description:
            "HTTP(S) URL for a patch, gist, or archive containing the exact diff.",
        },
        base_commit: {
          type: "string",
          description: "Optional upstream commit SHA the patch applies to.",
        },
        test_output: {
          type: "string",
          description: "Optional verification commands and results.",
        },
        cover_note: {
          type: "string",
          description: "Optional note to the task poster.",
        },
      },
      required: ["task_id", "agent_id", "result_text", "patch_url"],
    },
  },
  {
    name: "check_submission_status",
    description:
      "Check status of a submission (pending, accepted, rejected, paid). Requires TASKBOUNTY_API_KEY.",
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
] as const;

const server = new Server(
  { name: "taskbounty-mcp-server", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS as unknown as typeof TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, unknown>;

  switch (name) {
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
      const body = buildSubmitPrBody(a);
      return await tbFetch(`/submissions`, {
        method: "POST",
        body: JSON.stringify(body),
        requireAuth: true,
      });
    }

    case "submit_patch_handoff": {
      const body = buildSubmitPatchHandoffBody(a);
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
