export type DeviceLoginResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type DeviceStart = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

type DeviceToken = {
  access_token: string;
  taskbounty_user_id?: string;
};

export type DeviceLoginOptions = {
  siteOrigin: string;
  clientName: string;
  credentialPath: string;
  persistToken: (accessToken: string, userId?: string) => void;
  fetchImpl?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
  nowMs?: () => number;
};

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function instruction(start: DeviceStart): string {
  return (
    `Open this URL in your browser and approve:\n  ${start.verification_uri_complete}\n` +
    `Your code: ${start.user_code}\n` +
    `(If the link does not prefill, go to ${start.verification_uri} and enter the code.)\n\n` +
    `Waiting for approval...`
  );
}

function withInstruction(start: DeviceStart, text: string, isError?: true): DeviceLoginResult {
  return {
    content: [{ type: "text", text: `${instruction(start)}\n\n${text}` }],
    isError,
  };
}

export async function runDeviceLogin(options: DeviceLoginOptions): Promise<DeviceLoginResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? defaultSleep;
  const nowMs = options.nowMs ?? Date.now;
  const siteOrigin = options.siteOrigin.replace(/\/$/, "");

  let start: DeviceStart;
  try {
    const res = await fetchImpl(`${siteOrigin}/api/mcp/device/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_name: options.clientName }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        content: [
          {
            type: "text",
            text: `Could not start login (HTTP ${res.status}) from ${siteOrigin}/api/mcp/device/start\n\n${body}`,
          },
        ],
        isError: true,
      };
    }
    start = (await res.json()) as DeviceStart;
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Network error starting login: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  const deadline = nowMs() + start.expires_in * 1000;
  let intervalMs = Math.max(1, start.interval) * 1000;

  while (nowMs() < deadline) {
    await sleepMs(intervalMs);
    let res: Response;
    try {
      res = await fetchImpl(`${siteOrigin}/api/mcp/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ device_code: start.device_code }),
      });
    } catch {
      continue;
    }

    if (res.ok) {
      const data = (await res.json()) as DeviceToken;
      try {
        options.persistToken(data.access_token, data.taskbounty_user_id);
      } catch (err) {
        return withInstruction(
          start,
          `Login succeeded but could not write ${options.credentialPath}: ${
            err instanceof Error ? err.message : String(err)
          }. Set TASKBOUNTY_API_KEY=${data.access_token} in your environment instead.`,
          true,
        );
      }
      return withInstruction(
        start,
        `Logged in. Credentials saved to ${options.credentialPath} (mode 0600).\n` +
          `For CI or headless use, you can also set the env var:\n` +
          `  TASKBOUNTY_API_KEY=${data.access_token}\n\n` +
          `You can now use creator tools like autopilot_enable and post_from_issue.`,
      );
    }

    let errorCode = "";
    try {
      errorCode = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      errorCode = "";
    }
    if (errorCode === "authorization_pending") continue;
    if (errorCode === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (errorCode === "expired_token" || errorCode === "access_denied") {
      return withInstruction(
        start,
        errorCode === "access_denied"
          ? "Login was denied in the browser. Run taskbounty_login again to retry."
          : "Login code expired before approval. Run taskbounty_login again to retry.",
        true,
      );
    }
    return withInstruction(
      start,
      `Login failed (HTTP ${res.status}, error="${errorCode}"). Run taskbounty_login again to retry.`,
      true,
    );
  }

  return withInstruction(
    start,
    "Login timed out waiting for browser approval. Run taskbounty_login again to retry.",
    true,
  );
}
