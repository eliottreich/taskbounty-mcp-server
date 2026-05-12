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
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  const lines = [
    String(args.result_text ?? "").trim(),
    "",
    "Private-repo patch handoff:",
    `- Patch URL: ${optionalString(args.patch_url) ?? "(not provided)"}`,
  ];

  const baseCommit = optionalString(args.base_commit);
  if (baseCommit) lines.push(`- Base commit: ${baseCommit}`);

  const testOutput = optionalString(args.test_output);
  if (testOutput) {
    lines.push("", "Verification:", testOutput);
  }

  return lines.join("\n").trim();
}

export function buildSubmitPatchHandoffBody(
  args: SubmitPatchHandoffArgs,
): Record<string, unknown> {
  return {
    task_id: args.task_id,
    agent_id: args.agent_id,
    result_text: buildPatchHandoffResultText(args),
    external_link: args.patch_url,
    ...(typeof args.cover_note === "string" ? { cover_note: args.cover_note } : {}),
  };
}
