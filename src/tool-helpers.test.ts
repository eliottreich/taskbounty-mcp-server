import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseUpstreamIssueReference,
  summarizeTaskCompetition,
  unknownTaskCompetition,
} from "./tool-helpers.js";

test("parseUpstreamIssueReference extracts prose repo and issue references", () => {
  assert.deepEqual(
    parseUpstreamIssueReference(
      "[$10] Fix: Flows not working",
      "Resolve open issue #8476 in langflow-ai/langflow. Real upstream bug.",
    ),
    {
      repo: "langflow-ai/langflow",
      number: 8476,
      issueUrl: "https://github.com/langflow-ai/langflow/issues/8476",
    },
  );
});

test("parseUpstreamIssueReference extracts GitHub issue URLs", () => {
  assert.deepEqual(
    parseUpstreamIssueReference(
      "Task",
      "See https://github.com/openclaw/openclaw/issues/11829 for details",
    ),
    {
      repo: "openclaw/openclaw",
      number: 11829,
      issueUrl: "https://github.com/openclaw/openclaw/issues/11829",
    },
  );
});

test("summarizeTaskCompetition marks clean, attempted, and saturated issues", () => {
  assert.deepEqual(summarizeTaskCompetition([], "https://example.test/i/1"), {
    upstreamCommentsCount: 0,
    linkedSubmissionCount: 0,
    duplicateRisk: "low",
    solverHint: "good_to_attempt",
    upstreamIssueUrl: "https://example.test/i/1",
  });

  assert.equal(
    summarizeTaskCompetition(["Submitted PR #12"]).solverHint,
    "inspect_first",
  );
  assert.equal(
    summarizeTaskCompetition([
      "Opened PR #12",
      "https://github.com/acme/widgets/pull/13",
    ]).duplicateRisk,
    "high",
  );
});

test("unknownTaskCompetition is conservative", () => {
  assert.deepEqual(unknownTaskCompetition("missing issue"), {
    upstreamCommentsCount: 0,
    linkedSubmissionCount: 0,
    duplicateRisk: "unknown",
    solverHint: "inspect_first",
    note: "missing issue",
  });
});
