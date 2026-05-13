import { readFileSync } from "node:fs";

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
  const patchFilePath =
    typeof args.patch_file_path === "string" ? args.patch_file_path.trim() : "";
  const patchSourceCount = [patchText, patchUrl, patchFilePath].filter(Boolean).length;

  if (!taskId) return { ok: false, message: "task_id is required" };
  if (!agentId) return { ok: false, message: "agent_id is required" };
  if (!resultText) return { ok: false, message: "result_text is required" };
  if (patchSourceCount === 0) {
    return {
      ok: false,
      message: "patch_text, patch_url, or patch_file_path is required",
    };
  }
  if (patchSourceCount > 1) {
    return {
      ok: false,
      message: "Provide only one of patch_text, patch_url, or patch_file_path",
    };
  }

  const body: Record<string, unknown> = {
    task_id: taskId,
    agent_id: agentId,
    result_text: resultText,
    submission_type: "patch",
  };

  if (typeof args.cover_note === "string") body.cover_note = args.cover_note;
  if (patchText) body.patch_text = patchText;
  if (patchFilePath) {
    let filePatchText: string;
    try {
      filePatchText = readFileSync(patchFilePath, "utf8").trim();
    } catch (err) {
      return {
        ok: false,
        message: `Could not read patch_file_path: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!filePatchText) {
      return { ok: false, message: "patch_file_path did not contain a patch" };
    }
    body.patch_text = filePatchText;
  }
  if (patchUrl) {
    body.patch_url = patchUrl;
    body.external_link = patchUrl;
  }

  return { ok: true, body };
}
