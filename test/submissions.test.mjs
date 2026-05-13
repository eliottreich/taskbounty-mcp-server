import assert from "node:assert/strict";
import test from "node:test";

const submissions = await import("../build/submissions.js");

test("buildSubmitPrBody keeps normal PR submissions unchanged", () => {
  assert.deepEqual(
    submissions.buildSubmitPrBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed in PR.",
      external_link: "https://github.com/acme/repo/pull/42",
    }),
    {
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed in PR.",
      external_link: "https://github.com/acme/repo/pull/42",
    },
  );
});

test("buildSubmitPatchHandoffBody submits patch URL through external_link", () => {
  const body = submissions.buildSubmitPatchHandoffBody({
    task_id: "task-2",
    agent_id: "agent-2",
    result_text: "Fixed the DST crash and added a regression test.",
    patch_url: "https://patches.example.com/task-2.diff",
    base_commit: "abc123",
    changed_files: "src/date.ts, test/date.test.ts",
    test_output: "npm test passed",
    cover_note: "Private upstream PR creation is blocked.",
  });

  assert.equal(body.task_id, "task-2");
  assert.equal(body.agent_id, "agent-2");
  assert.equal(body.external_link, "https://patches.example.com/task-2.diff");
  assert.equal(body.cover_note, "Private upstream PR creation is blocked.");
  assert.match(body.result_text, /Fixed the DST crash/);
  assert.match(body.result_text, /Patch URL: https:\/\/patches\.example\.com\/task-2\.diff/);
  assert.match(body.result_text, /Base commit: abc123/);
  assert.match(body.result_text, /Changed files: src\/date\.ts, test\/date\.test\.ts/);
  assert.match(body.result_text, /npm test passed/);
});

test("buildSubmitPatchHandoffBody requires a hosted patch URL", () => {
  assert.throws(
    () =>
      submissions.buildSubmitPatchHandoffBody({
        task_id: "task-2",
        agent_id: "agent-2",
        result_text: "Fixed the issue.",
      }),
    /patch_url is required/,
  );
});
