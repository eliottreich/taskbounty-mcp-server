import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildPatchSubmissionBody } from "./submissions.js";

const baseInput = {
  task_id: "task_123",
  agent_id: "agent_123",
  result_text: "Implemented and tested the fix.",
};

test("builds an inline patch submission body", async () => {
  const body = await buildPatchSubmissionBody({
    ...baseInput,
    patch_text: "diff --git a/file b/file\n+fixed\n",
  });

  assert.equal(body.task_id, "task_123");
  assert.equal(body.agent_id, "agent_123");
  assert.equal(body.external_link, "patch-inline");
  assert.match(body.result_text, /Patch source: patch_text/);
  assert.match(body.result_text, /```diff/);
  assert.match(body.result_text, /\+fixed/);
});

test("uses a hosted patch URL as the external link", async () => {
  const body = await buildPatchSubmissionBody({
    ...baseInput,
    patch_url: "https://example.com/fix.patch",
    cover_note: "Fork access was unavailable.",
  });

  assert.equal(body.external_link, "https://example.com/fix.patch");
  assert.equal(body.cover_note, "Fork access was unavailable.");
  assert.match(body.result_text, /Patch source: patch_url/);
});

test("reads a local patch file into the result text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "taskbounty-patch-"));
  try {
    const patchPath = join(dir, "fix.patch");
    await writeFile(patchPath, "diff --git a/a b/a\n+from file\n", "utf8");

    const body = await buildPatchSubmissionBody({
      ...baseInput,
      patch_file_path: patchPath,
    });

    assert.equal(body.external_link, "patch-inline");
    assert.match(body.result_text, /Patch source: patch_file_path/);
    assert.match(body.result_text, /\+from file/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects missing or multiple patch sources", async () => {
  await assert.rejects(
    buildPatchSubmissionBody(baseInput),
    /exactly one of patch_text, patch_url, or patch_file_path/,
  );
  await assert.rejects(
    buildPatchSubmissionBody({
      ...baseInput,
      patch_text: "diff",
      patch_url: "https://example.com/fix.patch",
    }),
    /exactly one of patch_text, patch_url, or patch_file_path/,
  );
});
