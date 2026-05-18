import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGitHubRepo, requireNonEmpty } from "../build/validators.js";

// ── parseGitHubRepo ───────────────────────────────────────────────────────────

describe("parseGitHubRepo", () => {
  // Happy paths
  it("accepts owner/name", () => {
    assert.deepEqual(parseGitHubRepo("acme/widgets"), { ok: true, value: "acme/widgets" });
  });

  it("accepts https GitHub URL", () => {
    assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  it("accepts http GitHub URL", () => {
    assert.deepEqual(parseGitHubRepo("http://github.com/acme/widgets"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  it("strips .git suffix", () => {
    assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets.git"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  it("strips .git suffix and trailing slash", () => {
    assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets.git/"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  it("strips query string", () => {
    assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets?tab=issues"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  it("strips fragment", () => {
    assert.deepEqual(parseGitHubRepo("https://github.com/acme/widgets#readme"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  it("strips trailing slash without .git", () => {
    assert.deepEqual(parseGitHubRepo("acme/widgets/"), {
      ok: true,
      value: "acme/widgets",
    });
  });

  // Error paths
  it("rejects empty string", () => {
    const r = parseGitHubRepo("");
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("expected error");
    assert.equal(r.result.isError, true);
    assert.equal(r.result.content[0]?.text, "repo is required (owner/name or a GitHub URL)");
  });

  it("rejects null", () => {
    const r = parseGitHubRepo(null);
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("expected error");
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0]?.text ?? "", /repo is required/);
  });

  it("rejects undefined", () => {
    const r = parseGitHubRepo(undefined);
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("expected error");
    assert.match(r.result.content[0]?.text ?? "", /repo is required/);
  });

  it("rejects plain string with no slash", () => {
    const r = parseGitHubRepo("not-a-repo");
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("expected error");
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0]?.text ?? "", /Could not parse repo/);
  });

  it("rejects whitespace-only input", () => {
    const r = parseGitHubRepo("   ");
    assert.equal(r.ok, false);
    if (r.ok) throw new Error("expected error");
    assert.match(r.result.content[0]?.text ?? "", /repo is required/);
  });
});

// ── requireNonEmpty ───────────────────────────────────────────────────────────

describe("requireNonEmpty", () => {
  it("returns null for a valid string", () => {
    assert.equal(requireNonEmpty("abc-123", "task_id"), null);
  });

  it("errors on empty string", () => {
    const r = requireNonEmpty("", "task_id");
    assert.notEqual(r, null);
    assert.equal(r?.isError, true);
    assert.equal(r?.content[0]?.text, "task_id is required");
  });

  it("errors on whitespace-only string", () => {
    const r = requireNonEmpty("   ", "submission_id");
    assert.notEqual(r, null);
    assert.equal(r?.isError, true);
    assert.equal(r?.content[0]?.text, "submission_id is required");
  });

  it("errors on null", () => {
    const r = requireNonEmpty(null, "issue_url");
    assert.notEqual(r, null);
    assert.equal(r?.isError, true);
    assert.equal(r?.content[0]?.text, "issue_url is required");
  });

  it("errors on undefined", () => {
    const r = requireNonEmpty(undefined, "task_id_or_slug");
    assert.notEqual(r, null);
    assert.equal(r?.isError, true);
    assert.equal(r?.content[0]?.text, "task_id_or_slug is required");
  });

  it("uses the field name verbatim in the error message", () => {
    const r = requireNonEmpty("", "bounty_amount");
    assert.equal(r?.content[0]?.text, "bounty_amount is required");
  });
});
