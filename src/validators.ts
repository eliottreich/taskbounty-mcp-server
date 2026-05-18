export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; result: ToolResult };

export function toolError(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Normalises a raw GitHub repo input to "owner/name".
 * Accepts: "owner/name", full GitHub URLs (http or https),
 * .git suffix, trailing slash, and ?query / #fragment suffixes.
 */
export function parseGitHubRepo(raw: unknown): ParseResult<string> {
  const s = String(raw ?? "").trim();
  if (!s) {
    return { ok: false, result: toolError("repo is required (owner/name or a GitHub URL)") };
  }
  const m = s.match(
    /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[?#].*)?$/i,
  );
  if (!m) {
    return {
      ok: false,
      result: toolError(`Could not parse repo "${s}". Use owner/name or a full GitHub URL.`),
    };
  }
  return { ok: true, value: `${m[1]}/${m[2]}` };
}

/**
 * Returns a ToolResult error when `raw` is empty/null/undefined/whitespace,
 * or null when the field is present.
 */
export function requireNonEmpty(raw: unknown, fieldName: string): ToolResult | null {
  const s = String(raw ?? "").trim();
  if (!s) return toolError(`${fieldName} is required`);
  return null;
}
