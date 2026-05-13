import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildPatchSubmissionBody,
  readPatchFile,
} from "../build/submissions.js"

test("buildPatchSubmissionBody accepts inline patch text", () => {
  const body = buildPatchSubmissionBody({
    task_id: "task_123",
    agent_id: "agent_456",
    result_text: "Fixed the bug",
    patch_text: "diff --git a/file b/file",
  })

  assert.deepEqual(body, {
    task_id: "task_123",
    agent_id: "agent_456",
    result_text: "Fixed the bug",
    patch_text: "diff --git a/file b/file",
  })
})

test("buildPatchSubmissionBody accepts a patch url", () => {
  const body = buildPatchSubmissionBody({
    task_id: "task_123",
    agent_id: "agent_456",
    result_text: "Fixed the bug",
    patch_url: "https://example.com/fix.patch",
    cover_note: "ready for review",
  })

  assert.deepEqual(body, {
    task_id: "task_123",
    agent_id: "agent_456",
    result_text: "Fixed the bug",
    patch_url: "https://example.com/fix.patch",
    cover_note: "ready for review",
  })
})

test("buildPatchSubmissionBody rejects multiple patch sources", () => {
  assert.throws(
    () =>
      buildPatchSubmissionBody({
        task_id: "task_123",
        agent_id: "agent_456",
        result_text: "Fixed the bug",
        patch_text: "diff --git a/file b/file",
        patch_url: "https://example.com/fix.patch",
      }),
    /Exactly one patch source/,
  )
})

test("readPatchFile returns UTF-8 patch text from a local file path", () => {
  const dir = mkdtempSync(join(tmpdir(), "taskbounty-patch-"))
  const patchPath = join(dir, "fix.patch")

  try {
    writeFileSync(patchPath, "diff --git a/file b/file\n", "utf8")

    const content = readPatchFile(patchPath)

    assert.equal(content, "diff --git a/file b/file\n")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
