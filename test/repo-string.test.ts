/**
 * Tests for the repo-string normalizer used in autopilot_enable.
 *
 * The normalizer converts various GitHub repo representations (owner/name,
 * full URL, with/without .git suffix) into the canonical "owner/name" format.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// The regex used in src/index.ts autopilot_enable handler (line ~767).
//   /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i
const REPO_REGEX =
  /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i;

function normalizeRepo(raw: string): string | null {
  const m = raw.match(REPO_REGEX);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

// ---------------------------------------------------------------------------
// Valid inputs (should parse)
// ---------------------------------------------------------------------------

test("simple owner/name", () => {
  assert.equal(normalizeRepo("acme/widgets"), "acme/widgets");
});

test("owner/name with trailing slash", () => {
  assert.equal(normalizeRepo("acme/widgets/"), "acme/widgets");
});

test("full GitHub URL (https, no trailing slash)", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets"),
    "acme/widgets",
  );
});

test("full GitHub URL with trailing slash", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets/"),
    "acme/widgets",
  );
});

test("full GitHub URL with .git suffix", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets.git"),
    "acme/widgets",
  );
});

test("full GitHub URL with .git and trailing slash", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets.git/"),
    "acme/widgets",
  );
});

test("http (not https) GitHub URL", () => {
  assert.equal(
    normalizeRepo("http://github.com/acme/widgets"),
    "acme/widgets",
  );
});

test("owner/name with hyphens and numbers", () => {
  assert.equal(
    normalizeRepo("my-org/my-repo-2"),
    "my-org/my-repo-2",
  );
});

test("owner/name with dots", () => {
  assert.equal(
    normalizeRepo("org.name/repo.name"),
    "org.name/repo.name",
  );
});

test("owner with single character name", () => {
  assert.equal(normalizeRepo("a/b"), "a/b");
});

test("full URL with single character segments", () => {
  assert.equal(
    normalizeRepo("https://github.com/a/b"),
    "a/b",
  );
});

// ---------------------------------------------------------------------------
// Invalid inputs (should return null)
// ---------------------------------------------------------------------------

test("empty string", () => {
  assert.equal(normalizeRepo(""), null);
});

test("just a username without repo", () => {
  assert.equal(normalizeRepo("acme"), null);
});

test("GitHub URL without repo (org only)", () => {
  assert.equal(normalizeRepo("https://github.com/acme"), null);
});

test("GitHub URL without repo, trailing slash", () => {
  assert.equal(normalizeRepo("https://github.com/acme/"), null);
});

test("non-GitHub URL", () => {
  assert.equal(
    normalizeRepo("https://gitlab.com/acme/widgets"),
    null,
  );
});

test("repo with spaces", () => {
  assert.equal(normalizeRepo("acme/widget s"), null);
});

test("path with extra segment (three parts)", () => {
  // acme/widgets/extra — the regex only captures two segments
  assert.equal(normalizeRepo("acme/widgets/extra"), null);
});

test("string with URL fragment", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets#readme"),
    null,
  );
});

test("string with URL query parameters", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets?tab=readme"),
    null,
  );
});

test("string with both query and fragment", () => {
  assert.equal(
    normalizeRepo("https://github.com/acme/widgets?tab=readme#section"),
    null,
  );
});

test("whitespace-only string", () => {
  assert.equal(normalizeRepo("   "), null);
});
