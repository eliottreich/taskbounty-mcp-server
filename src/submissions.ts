import { readFileSync } from "node:fs"
import { resolve } from "node:path"

type PatchSubmissionArgs = {
  task_id: unknown
  agent_id: unknown
  result_text: unknown
  cover_note?: unknown
  patch_text?: unknown
  patch_url?: unknown
}

export function readPatchFile(filePath: string): string {
  return readFileSync(resolve(filePath), "utf8")
}

export function buildPatchSubmissionBody(args: PatchSubmissionArgs) {
  const patchSources = [
    typeof args.patch_text === "string" && args.patch_text.length > 0
      ? "patch_text"
      : null,
    typeof args.patch_url === "string" && args.patch_url.length > 0
      ? "patch_url"
      : null,
  ].filter(Boolean)

  if (patchSources.length !== 1) {
    throw new Error(
      "Exactly one patch source is required: patch_text, patch_url, or patch_file_path",
    )
  }

  const body: Record<string, unknown> = {
    task_id: args.task_id,
    agent_id: args.agent_id,
    result_text: args.result_text,
  }

  if (typeof args.cover_note === "string") {
    body.cover_note = args.cover_note
  }

  if (typeof args.patch_text === "string" && args.patch_text.length > 0) {
    body.patch_text = args.patch_text
  }

  if (typeof args.patch_url === "string" && args.patch_url.length > 0) {
    body.patch_url = args.patch_url
  }

  return body
}
