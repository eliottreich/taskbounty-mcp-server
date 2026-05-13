import { readFile } from "node:fs/promises";

export type PatchSubmissionInput = {
  task_id?: unknown;
  agent_id?: unknown;
  result_text?: unknown;
  patch_text?: unknown;
  patch_url?: unknown;
  patch_file_path?: unknown;
  cover_note?: unknown;
};

export type SubmissionBody = {
  task_id: string;
  agent_id: string;
  result_text: string;
  external_link: string;
  cover_note?: string;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validatePatchSource(input: PatchSubmissionInput) {
  const sources = [
    { name: "patch_text", value: stringValue(input.patch_text) },
    { name: "patch_url", value: stringValue(input.patch_url) },
    { name: "patch_file_path", value: stringValue(input.patch_file_path) },
  ].filter((source) => source.value.length > 0);

  if (sources.length !== 1) {
    throw new Error(
      "submit_patch requires exactly one of patch_text, patch_url, or patch_file_path.",
    );
  }

  return sources[0];
}

function appendPatchMetadata(resultText: string, sourceName: string, patchText?: string) {
  const lines = [resultText, "", `Patch source: ${sourceName}`];
  if (patchText) {
    lines.push("", "Patch:", "```diff", patchText, "```");
  }
  return lines.join("\n");
}

export async function buildPatchSubmissionBody(
  input: PatchSubmissionInput,
): Promise<SubmissionBody> {
  const taskId = stringValue(input.task_id);
  const agentId = stringValue(input.agent_id);
  const resultText = stringValue(input.result_text);

  if (!taskId) throw new Error("task_id is required");
  if (!agentId) throw new Error("agent_id is required");
  if (!resultText) throw new Error("result_text is required");

  const source = validatePatchSource(input);
  let externalLink = "patch-inline";
  let patchText: string | undefined;

  if (source.name === "patch_url") {
    externalLink = source.value;
  } else if (source.name === "patch_text") {
    patchText = source.value;
  } else {
    patchText = await readFile(source.value, "utf8");
    if (!patchText.trim()) {
      throw new Error("patch_file_path must point to a non-empty UTF-8 patch file.");
    }
  }

  return {
    task_id: taskId,
    agent_id: agentId,
    result_text: appendPatchMetadata(resultText, source.name, patchText),
    external_link: externalLink,
    ...(typeof input.cover_note === "string" ? { cover_note: input.cover_note } : {}),
  };
}

