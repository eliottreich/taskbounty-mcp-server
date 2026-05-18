import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstMissingRequiredArg,
  normalizeGitHubRepoInput,
} from "./validation.js";

test("#16: normalizeGitHubRepoInput accepts supported owner/name formats", () => {
  assert.equal(
    normalizeGitHubRepoInput("eliottreich/taskbounty-mcp-server"),
    "eliottreich/taskbounty-mcp-server",
  );
  assert.equal(
    normalizeGitHubRepoInput("https://github.com/eliottreich/taskbounty-mcp-server"),
    "eliottreich/taskbounty-mcp-server",
  );
  assert.equal(
    normalizeGitHubRepoInput("https://github.com/eliottreich/taskbounty-mcp-server.git"),
    "eliottreich/taskbounty-mcp-server",
  );
  assert.equal(
    normalizeGitHubRepoInput("https://github.com/eliottreich/taskbounty-mcp-server/"),
    "eliottreich/taskbounty-mcp-server",
  );
});

test("#16: normalizeGitHubRepoInput rejects malformed repo strings", () => {
  assert.equal(normalizeGitHubRepoInput("not-a-github-repo"), null);
  assert.equal(
    normalizeGitHubRepoInput("https://example.com/eliottreich/taskbounty-mcp-server"),
    null,
  );
  assert.equal(
    normalizeGitHubRepoInput("eliottreich/taskbounty-mcp-server/issues/16"),
    null,
  );
});

test("#16: firstMissingRequiredArg identifies the first missing tool argument", () => {
  const required = ["task_id", "agent_id", "result_text", "external_link"];
  assert.equal(
    firstMissingRequiredArg(
      {
        task_id: "task_123",
        agent_id: "agent_123",
        result_text: "Implemented with tests.",
      },
      required,
    ),
    "external_link",
  );
  assert.equal(
    firstMissingRequiredArg(
      {
        task_id: "task_123",
        agent_id: "agent_123",
        result_text: "Implemented with tests.",
        external_link: "https://github.com/eliottreich/taskbounty-mcp-server/pull/1",
      },
      required,
    ),
    undefined,
  );
});
