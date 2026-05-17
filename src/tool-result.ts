export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function toolError(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}
