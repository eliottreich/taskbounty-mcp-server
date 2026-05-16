import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type SubmitPrArgs = {
  task_id?: unknown;
  agent_id?: unknown;
  result_text?: unknown;
  external_link?: unknown;
  cover_note?: unknown;
};

export type PatchHandoffArgs = {
  task_id?: unknown;
  agent_id?: unknown;
  result_text?: unknown;
  patch_text?: unknown;
  patch_url?: unknown;
  patch_file_path?: unknown;
  base_commit?: unknown;
  changed_files?: unknown;
  verification?: unknown;
  cover_note?: unknown;
};

type PatchSource =
  | { kind: "patch_text"; value: string }
  | { kind: "patch_url"; value: string }
  | { kind: "patch_file_path"; value: string; text: string };

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeChangedFiles(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const files = value
      .filter((file): file is string => typeof file === "string")
      .map((file) => file.trim())
      .filter(Boolean);
    return files.length ? files.join(", ") : undefined;
  }

  return optionalString(value);
}

function looksLikePatch(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith("diff --git ") ||
    (trimmed.startsWith("From ") && trimmed.includes("\ndiff --git ")) ||
    ((trimmed.startsWith("--- ") || trimmed.includes("\n--- ")) &&
      trimmed.includes("\n+++ "))
  );
}

function requirePatchText(text: string, fieldName: string): string {
  const patch = text.trim();
  if (!patch) {
    throw new Error(`${fieldName} is empty`);
  }
  if (!looksLikePatch(patch)) {
    throw new Error(`${fieldName} must look like a unified diff or git format-patch`);
  }
  return patch;
}

function requirePatchUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("patch_url must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("patch_url must use http or https");
  }
  return parsed.toString();
}

function readPatchFile(filePath: string): string {
  try {
    return readFileSync(resolve(filePath), "utf8");
  } catch (err) {
    throw new Error(
      `Could not read patch_file_path: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function getPatchSource(args: PatchHandoffArgs): PatchSource {
  const patchText = optionalString(args.patch_text);
  const patchUrl = optionalString(args.patch_url);
  const patchFilePath = optionalString(args.patch_file_path);
  const sourceCount = [patchText, patchUrl, patchFilePath].filter(Boolean).length;

  if (sourceCount !== 1) {
    throw new Error("Provide exactly one of patch_text, patch_url, or patch_file_path");
  }

  if (patchText) {
    return { kind: "patch_text", value: requirePatchText(patchText, "patch_text") };
  }

  if (patchUrl) {
    return { kind: "patch_url", value: requirePatchUrl(patchUrl) };
  }

  const filePath = patchFilePath as string;
  return {
    kind: "patch_file_path",
    value: filePath,
    text: requirePatchText(readPatchFile(filePath), "patch_file_path"),
  };
}

export function buildSubmitPrBody(args: SubmitPrArgs): Record<string, unknown> {
  const body: Record<string, unknown> = {
    task_id: requiredString(args as Record<string, unknown>, "task_id"),
    agent_id: requiredString(args as Record<string, unknown>, "agent_id"),
    result_text: requiredString(args as Record<string, unknown>, "result_text"),
    external_link: requiredString(args as Record<string, unknown>, "external_link"),
  };

  const coverNote = optionalString(args.cover_note);
  if (coverNote) body.cover_note = coverNote;

  return body;
}

export function buildPatchHandoffResultText(args: PatchHandoffArgs, source: PatchSource): string {
  const lines = [
    requiredString(args as Record<string, unknown>, "result_text"),
    "",
    "Private-repo patch handoff:",
  ];

  if (source.kind === "patch_url") {
    lines.push(`- Patch URL: ${source.value}`);
  } else {
    lines.push("- Patch attached as patch_text");
  }

  const baseCommit = optionalString(args.base_commit);
  if (baseCommit) lines.push(`- Base commit: ${baseCommit}`);

  const changedFiles = normalizeChangedFiles(args.changed_files);
  if (changedFiles) lines.push(`- Changed files: ${changedFiles}`);

  const verification = optionalString(args.verification);
  if (verification) lines.push("", "Verification:", verification);

  return lines.join("\n").trim();
}

export function buildPatchHandoffBody(args: PatchHandoffArgs): Record<string, unknown> {
  const source = getPatchSource(args);
  const body: Record<string, unknown> = {
    task_id: requiredString(args as Record<string, unknown>, "task_id"),
    agent_id: requiredString(args as Record<string, unknown>, "agent_id"),
    result_text: buildPatchHandoffResultText(args, source),
    submission_type: "patch",
  };

  const coverNote = optionalString(args.cover_note);
  if (coverNote) body.cover_note = coverNote;

  if (source.kind === "patch_url") {
    body.patch_url = source.value;
    body.external_link = source.value;
  } else if (source.kind === "patch_file_path") {
    body.patch_text = source.text;
  } else {
    body.patch_text = source.value;
  }

  return body;
}
