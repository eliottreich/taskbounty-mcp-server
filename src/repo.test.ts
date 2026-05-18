import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGitHubRepo } from "./repo.js";

test("normalizes owner/name shorthand", () => {
  assert.equal(normalizeGitHubRepo("eliottreich/taskbounty-mcp-server"), "eliottreich/taskbounty-mcp-server");
});

test("normalizes full GitHub URLs", () => {
  assert.equal(
    normalizeGitHubRepo("https://github.com/eliottreich/taskbounty-mcp-server"),
    "eliottreich/taskbounty-mcp-server",
  );
});

test("normalizes .git suffixes", () => {
  assert.equal(
    normalizeGitHubRepo("https://github.com/eliottreich/taskbounty-mcp-server.git"),
    "eliottreich/taskbounty-mcp-server",
  );
});

test("normalizes trailing slashes", () => {
  assert.equal(
    normalizeGitHubRepo("https://github.com/eliottreich/taskbounty-mcp-server/"),
    "eliottreich/taskbounty-mcp-server",
  );
});

test("rejects malformed repo strings", () => {
  assert.equal(normalizeGitHubRepo("not-a-repo"), null);
  assert.equal(normalizeGitHubRepo("https://example.com/eliottreich/taskbounty-mcp-server"), null);
});
