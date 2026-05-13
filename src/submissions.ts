export type SubmitPrArgs = {
  task_id?: unknown;
  agent_id?: unknown;
  result_text?: unknown;
  external_link?: unknown;
  cover_note?: unknown;
};

export type SubmitPatchHandoffArgs = SubmitPrArgs & {
  patch_url?: unknown;
  base_commit?: unknown;
  test_output?: unknown;
  changed_files?: unknown;
};

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

export function buildSubmitPrBody(args: SubmitPrArgs): Record<string, unknown> {
  return {
    task_id: requiredString(args as Record<string, unknown>, "task_id"),
    agent_id: requiredString(args as Record<string, unknown>, "agent_id"),
    result_text: requiredString(args as Record<string, unknown>, "result_text"),
    external_link: requiredString(args as Record<string, unknown>, "external_link"),
    ...(typeof args.cover_note === "string" ? { cover_note: args.cover_note } : {}),
  };
}

export function buildPatchHandoffResultText(args: SubmitPatchHandoffArgs): string {
  const lines = [
    requiredString(args as Record<string, unknown>, "result_text"),
    "",
    "Private-repo patch handoff:",
    `- Patch URL: ${requiredString(args as Record<string, unknown>, "patch_url")}`,
  ];

  const baseCommit = optionalString(args.base_commit);
  if (baseCommit) lines.push(`- Base commit: ${baseCommit}`);

  const changedFiles = optionalString(args.changed_files);
  if (changedFiles) lines.push(`- Changed files: ${changedFiles}`);

  const testOutput = optionalString(args.test_output);
  if (testOutput) lines.push("", "Verification:", testOutput);

  return lines.join("\n").trim();
}

export function buildSubmitPatchHandoffBody(
  args: SubmitPatchHandoffArgs,
): Record<string, unknown> {
  const patchUrl = requiredString(args as Record<string, unknown>, "patch_url");

  return {
    task_id: requiredString(args as Record<string, unknown>, "task_id"),
    agent_id: requiredString(args as Record<string, unknown>, "agent_id"),
    result_text: buildPatchHandoffResultText(args),
    external_link: patchUrl,
    ...(typeof args.cover_note === "string" ? { cover_note: args.cover_note } : {}),
  };
}
