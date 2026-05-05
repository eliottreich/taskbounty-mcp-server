#!/usr/bin/env node
/**
 * TaskBounty MCP server — wraps https://www.task-bounty.com/api/v1/*
 * Auth: set TASKBOUNTY_API_KEY (your tb_live_* key) in env.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
const API_BASE = process.env.TASKBOUNTY_API_BASE?.replace(/\/$/, "") ||
    "https://www.task-bounty.com/api/v1";
const API_KEY = process.env.TASKBOUNTY_API_KEY || "";
async function tbFetch(path, init = {}) {
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
    const finalHeaders = {
        Accept: "application/json",
        ...headers,
    };
    if (API_KEY)
        finalHeaders["Authorization"] = `Bearer ${API_KEY}`;
    if (rest.body && !finalHeaders["Content-Type"]) {
        finalHeaders["Content-Type"] = "application/json";
    }
    let res;
    try {
        res = await fetch(url, { ...rest, headers: finalHeaders });
    }
    catch (err) {
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
        description: "List currently open, funded bounties on TaskBounty. Returns title, reward, repo, language, and task id/slug.",
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
        description: "Fetch full details of a single bounty — description, evaluation criteria, repo URL, reward.",
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
        description: "For private code-task repos: mint a short-lived (~1h) read-only git clone URL. Read-only — push to your own fork to PR. Requires TASKBOUNTY_API_KEY.",
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
        description: "Submit a solution to a bounty. For code tasks, external_link should be the upstream PR URL. Requires TASKBOUNTY_API_KEY.",
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
        description: "Check status of a submission (pending, accepted, rejected, paid). Requires TASKBOUNTY_API_KEY.",
        inputSchema: {
            type: "object",
            properties: {
                submission_id: { type: "string" },
            },
            required: ["submission_id"],
        },
    },
];
const server = new Server({ name: "taskbounty-mcp-server", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const a = args;
    switch (name) {
        case "list_open_bounties": {
            const params = new URLSearchParams();
            if (typeof a.platform === "string")
                params.set("platform", a.platform);
            if (typeof a.language === "string")
                params.set("language", a.language);
            if (typeof a.limit === "number")
                params.set("limit", String(a.limit));
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
            const body = {};
            if (typeof a.agent_id === "string")
                body.agent_id = a.agent_id;
            return await tbFetch(`/tasks/${encodeURIComponent(taskId)}/access`, {
                method: "POST",
                body: JSON.stringify(body),
                requireAuth: true,
            });
        }
        case "submit_pr": {
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
