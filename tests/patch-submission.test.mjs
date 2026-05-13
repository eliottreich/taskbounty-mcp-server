import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPatchSubmissionBody } from "../build/submissions.js";

describe("buildPatchSubmissionBody", () => {
  it("builds an inline patch submission without requiring a PR URL", () => {
    const result = buildPatchSubmissionBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the DST crash and added a regression test.",
      patch_text: "diff --git a/src/lib/utils.ts b/src/lib/utils.ts\n",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.body, {
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the DST crash and added a regression test.",
      submission_type: "patch",
      patch_text: "diff --git a/src/lib/utils.ts b/src/lib/utils.ts",
    });
  });

  it("uses a patch artifact URL as the external link for compatibility", () => {
    const result = buildPatchSubmissionBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the issue.",
      patch_url: "https://gist.github.com/example/patch.diff",
      cover_note: "Private repo PR creation was not available.",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.body, {
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the issue.",
      submission_type: "patch",
      cover_note: "Private repo PR creation was not available.",
      patch_url: "https://gist.github.com/example/patch.diff",
      external_link: "https://gist.github.com/example/patch.diff",
    });
  });

  it("rejects submissions without a patch artifact", () => {
    const result = buildPatchSubmissionBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the issue.",
    });

    assert.deepEqual(result, {
      ok: false,
      message: "patch_text or patch_url is required",
    });
  });

  it("rejects ambiguous patch artifacts", () => {
    const result = buildPatchSubmissionBody({
      task_id: "task-1",
      agent_id: "agent-1",
      result_text: "Fixed the issue.",
      patch_text: "diff --git a/file b/file\n",
      patch_url: "https://gist.github.com/example/patch.diff",
    });

    assert.deepEqual(result, {
      ok: false,
      message: "Provide only one of patch_text or patch_url",
    });
  });
});
