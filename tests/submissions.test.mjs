import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const submissions = await import("../build/submissions.js");

test("buildSubmitPrBody preserves the existing upstream PR submission shape", () => {
  assert.deepEqual(
    submissions.buildSubmitPrBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the bug and added a regression test.",
      external_link: "https://github.com/owner/repo/pull/42",
      cover_note: "Ready for sandbox verification.",
    }),
    {
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the bug and added a regression test.",
      external_link: "https://github.com/owner/repo/pull/42",
      cover_note: "Ready for sandbox verification.",
    },
  );
});

test("buildPatchHandoffBody submits a hosted patch URL with review metadata", () => {
  const body = submissions.buildPatchHandoffBody({
    task_id: "task-2",
    agent_id: "agent-2",
    result_text: "Fixed the DST deadline crash.",
    patch_url: "https://patches.example.com/task-2.patch",
    base_commit: "abc1234",
    changed_files: ["src/deadline.ts", "tests/deadline.test.ts"],
    verification: "npm test passed",
    cover_note: "Private repo fork/PR creation is blocked for this agent.",
  });

  assert.equal(body.task_id, "task-2");
  assert.equal(body.agent_id, "agent-2");
  assert.equal(body.external_link, "https://patches.example.com/task-2.patch");
  assert.equal(body.patch_url, "https://patches.example.com/task-2.patch");
  assert.equal(body.submission_type, "patch");
  assert.equal(body.cover_note, "Private repo fork/PR creation is blocked for this agent.");
  assert.match(body.result_text, /Fixed the DST deadline crash/);
  assert.match(body.result_text, /Patch URL: https:\/\/patches\.example\.com\/task-2\.patch/);
  assert.match(body.result_text, /Base commit: abc1234/);
  assert.match(body.result_text, /Changed files: src\/deadline\.ts, tests\/deadline\.test\.ts/);
  assert.match(body.result_text, /npm test passed/);
});

test("buildPatchHandoffBody reads a local patch file without leaking the local path", () => {
  const dir = mkdtempSync(join(tmpdir(), "taskbounty-patch-"));
  const patchPath = join(dir, "fix.patch");
  const patchText = "diff --git a/src/a.ts b/src/a.ts\n+export const fixed = true;\n";

  try {
    writeFileSync(patchPath, patchText, "utf8");

    const body = submissions.buildPatchHandoffBody({
      task_id: "task-3",
      agent_id: "agent-3",
      result_text: "Attached a private-repo patch.",
      patch_file_path: patchPath,
      changed_files: "src/a.ts",
    });

    assert.equal(body.patch_text, patchText.trim());
    assert.equal(body.submission_type, "patch");
    assert.equal(body.external_link, undefined);
    assert.doesNotMatch(body.result_text, new RegExp(patchPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(body.result_text, /Patch attached as patch_text/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildPatchHandoffBody rejects ambiguous patch sources", () => {
  assert.throws(
    () =>
      submissions.buildPatchHandoffBody({
        task_id: "task-4",
        agent_id: "agent-4",
        result_text: "Fixed the bug.",
        patch_text: "diff --git a/a b/a\n+ok\n",
        patch_url: "https://patches.example.com/task-4.patch",
      }),
    /Provide exactly one of patch_text, patch_url, or patch_file_path/,
  );
});

test("buildPatchHandoffBody accepts plain unified diff text", () => {
  const body = submissions.buildPatchHandoffBody({
    task_id: "task-plain",
    agent_id: "agent-plain",
    result_text: "Attached a plain unified diff.",
    patch_text: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
  });

  assert.equal(body.patch_text, "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new");
});

test("buildPatchHandoffBody rejects non-diff patch text", () => {
  assert.throws(
    () =>
      submissions.buildPatchHandoffBody({
        task_id: "task-5",
        agent_id: "agent-5",
        result_text: "Fixed the bug.",
        patch_text: "not a patch",
      }),
    /patch_text must look like a unified diff or git format-patch/,
  );
});
