type PatchSubmissionBuildResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string };

export function buildPatchSubmissionBody(
  args: Record<string, unknown>,
): PatchSubmissionBuildResult {
  const taskId = String(args.task_id ?? "");
  const agentId = String(args.agent_id ?? "");
  const resultText = String(args.result_text ?? "");
  const patchText = typeof args.patch_text === "string" ? args.patch_text.trim() : "";
  const patchUrl = typeof args.patch_url === "string" ? args.patch_url.trim() : "";

  if (!taskId) return { ok: false, message: "task_id is required" };
  if (!agentId) return { ok: false, message: "agent_id is required" };
  if (!resultText) return { ok: false, message: "result_text is required" };
  if (!patchText && !patchUrl) {
    return { ok: false, message: "patch_text or patch_url is required" };
  }
  if (patchText && patchUrl) {
    return { ok: false, message: "Provide only one of patch_text or patch_url" };
  }

  const body: Record<string, unknown> = {
    task_id: taskId,
    agent_id: agentId,
    result_text: resultText,
    submission_type: "patch",
  };

  if (typeof args.cover_note === "string") body.cover_note = args.cover_note;
  if (patchText) body.patch_text = patchText;
  if (patchUrl) {
    body.patch_url = patchUrl;
    body.external_link = patchUrl;
  }

  return { ok: true, body };
}
