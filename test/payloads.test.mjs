import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const payloads = await import("../build/payloads.js");

test("buildSubmitPatchHandoffBody preserves patch URL and verification notes", () => {
  const body = payloads.buildSubmitPatchHandoffBody({
    task_id: "task-1",
    agent_id: "agent-1",
    result_text: "Fixes the private repo workflow.",
    patch_url: "https://patches.example.com/task.patch",
    base_commit: "abc123",
    test_output: "npm test passed",
    cover_note: "Forking is blocked; patch handoff attached.",
  });

  assert.equal(body.task_id, "task-1");
  assert.equal(body.agent_id, "agent-1");
  assert.equal(body.submission_type, "patch");
  assert.equal(body.patch_url, "https://patches.example.com/task.patch");
  assert.equal(body.external_link, "https://patches.example.com/task.patch");
  assert.equal(body.cover_note, "Forking is blocked; patch handoff attached.");
  assert.match(body.result_text, /Fixes the private repo workflow/);
  assert.match(body.result_text, /Patch URL: https:\/\/patches\.example\.com\/task\.patch/);
  assert.match(body.result_text, /Base commit: abc123/);
  assert.match(body.result_text, /npm test passed/);
});

test("buildSubmitPatchBody accepts inline patch text without a URL", () => {
  const body = payloads.buildSubmitPatchBody({
    task_id: "task-1",
    agent_id: "agent-1",
    result_text: "Fixes the private repo workflow.",
    patch_text: "diff --git a/src/index.ts b/src/index.ts\n",
  });

  assert.equal(body.task_id, "task-1");
  assert.equal(body.agent_id, "agent-1");
  assert.equal(body.submission_type, "patch");
  assert.equal(body.patch_text, "diff --git a/src/index.ts b/src/index.ts");
  assert.equal(body.external_link, undefined);
  assert.match(body.result_text, /Patch text supplied inline/);
});

test("buildSubmitPatchBody reads a local patch file", () => {
  const dir = mkdtempSync(join(tmpdir(), "taskbounty-patch-"));
  const patchPath = join(dir, "fix.patch");

  try {
    writeFileSync(patchPath, "diff --git a/README.md b/README.md\n", "utf8");
    const body = payloads.buildSubmitPatchBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixes the private repo workflow.",
      patch_file_path: patchPath,
    });

    assert.equal(body.patch_text, "diff --git a/README.md b/README.md");
    assert.match(body.result_text, /Patch file path:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildSubmitPatchBody rejects missing or ambiguous patch sources", () => {
  assert.throws(
    () =>
      payloads.buildSubmitPatchBody({
        task_id: "task-1",
        agent_id: "agent-1",
        result_text: "Fixes the private repo workflow.",
      }),
    /patch_text, patch_url, or patch_file_path is required/,
  );

  assert.throws(
    () =>
      payloads.buildSubmitPatchBody({
        task_id: "task-1",
        agent_id: "agent-1",
        result_text: "Fixes the private repo workflow.",
        patch_text: "diff --git a/a b/a\n",
        patch_url: "https://patches.example.com/task.patch",
      }),
    /Provide exactly one/,
  );
});

test("buildSubmitPrBody keeps the upstream PR payload unchanged", () => {
  const body = payloads.buildSubmitPrBody({
    task_id: "task-2",
    agent_id: "agent-2",
    result_text: "Implemented in PR.",
    external_link: "https://github.com/owner/repo/pull/12",
  });

  assert.deepEqual(body, {
    task_id: "task-2",
    agent_id: "agent-2",
    result_text: "Implemented in PR.",
    external_link: "https://github.com/owner/repo/pull/12",
  });
});
