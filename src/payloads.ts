import { readFileSync } from "node:fs";

export type SubmitPrArgs = {
  task_id?: unknown;
  agent_id?: unknown;
  result_text?: unknown;
  external_link?: unknown;
  cover_note?: unknown;
};

export type SubmitPatchHandoffArgs = SubmitPrArgs & {
  patch_text?: unknown;
  patch_url?: unknown;
  patch_file_path?: unknown;
  base_commit?: unknown;
  test_output?: unknown;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalPatchFile(path: string): string {
  const text = readFileSync(path, "utf8").trim();
  if (!text) throw new Error("patch_file_path did not contain a patch");
  return text;
}

export function buildSubmitPrBody(args: SubmitPrArgs): Record<string, unknown> {
  return {
    task_id: args.task_id,
    agent_id: args.agent_id,
    result_text: args.result_text,
    external_link: args.external_link,
    ...(typeof args.cover_note === "string" ? { cover_note: args.cover_note } : {}),
  };
}

export function buildPatchHandoffResultText(args: SubmitPatchHandoffArgs): string {
  const patchUrl = optionalString(args.patch_url);
  const patchText = optionalString(args.patch_text);
  const patchFilePath = optionalString(args.patch_file_path);
  const lines = [
    String(args.result_text ?? "").trim(),
    "",
    "Private-repo patch handoff:",
  ];

  if (patchUrl) lines.push(`- Patch URL: ${patchUrl}`);
  if (patchText) lines.push("- Patch text supplied inline.");
  if (patchFilePath) lines.push(`- Patch file path: ${patchFilePath}`);

  const baseCommit = optionalString(args.base_commit);
  if (baseCommit) lines.push(`- Base commit: ${baseCommit}`);

  const testOutput = optionalString(args.test_output);
  if (testOutput) {
    lines.push("", "Verification:", testOutput);
  }

  return lines.join("\n").trim();
}

export function buildSubmitPatchBody(
  args: SubmitPatchHandoffArgs,
): Record<string, unknown> {
  const patchText = optionalString(args.patch_text);
  const patchUrl = optionalString(args.patch_url);
  const patchFilePath = optionalString(args.patch_file_path);
  const patchSources = [patchText, patchUrl, patchFilePath].filter(Boolean);

  if (patchSources.length === 0) {
    throw new Error("patch_text, patch_url, or patch_file_path is required");
  }
  if (patchSources.length > 1) {
    throw new Error("Provide exactly one of patch_text, patch_url, or patch_file_path");
  }

  const body: Record<string, unknown> = {
    task_id: args.task_id,
    agent_id: args.agent_id,
    result_text: buildPatchHandoffResultText(args),
    submission_type: "patch",
    ...(typeof args.cover_note === "string" ? { cover_note: args.cover_note } : {}),
  };

  if (patchUrl) {
    body.patch_url = patchUrl;
    body.external_link = patchUrl;
  }
  if (patchText) body.patch_text = patchText;
  if (patchFilePath) body.patch_text = readOptionalPatchFile(patchFilePath);

  return body;
}

export function buildSubmitPatchHandoffBody(
  args: SubmitPatchHandoffArgs,
): Record<string, unknown> {
  return buildSubmitPatchBody(args);
}
