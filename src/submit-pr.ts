import { toolError, type ToolResult } from "./tool-result.js";

export type SubmitPrBody = {
  task_id: string;
  agent_id: string;
  result_text: string;
  external_link: string;
  cover_note?: string;
};

export type SubmitPrSender = (body: SubmitPrBody) => Promise<ToolResult>;

type SubmitPrValidation =
  | { ok: true; body: SubmitPrBody }
  | { ok: false; result: ToolResult };

function requiredNonEmptyString(
  args: Record<string, unknown>,
  key: keyof SubmitPrBody,
): string | ToolResult {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    return toolError(`${key} is required`);
  }
  return value.trim();
}

export function validateSubmitPrArgs(
  args: Record<string, unknown>,
): SubmitPrValidation {
  const taskId = requiredNonEmptyString(args, "task_id");
  if (typeof taskId !== "string") return { ok: false, result: taskId };

  const agentId = requiredNonEmptyString(args, "agent_id");
  if (typeof agentId !== "string") return { ok: false, result: agentId };

  const resultText = requiredNonEmptyString(args, "result_text");
  if (typeof resultText !== "string") return { ok: false, result: resultText };

  const externalLink = requiredNonEmptyString(args, "external_link");
  if (typeof externalLink !== "string") return { ok: false, result: externalLink };

  const body: SubmitPrBody = {
    task_id: taskId,
    agent_id: agentId,
    result_text: resultText,
    external_link: externalLink,
  };

  if (typeof args.cover_note === "string") {
    body.cover_note = args.cover_note;
  }

  return { ok: true, body };
}

export async function submitPr(
  args: Record<string, unknown>,
  send: SubmitPrSender,
): Promise<ToolResult> {
  const validation = validateSubmitPrArgs(args);
  if (!validation.ok) return validation.result;
  return await send(validation.body);
}
