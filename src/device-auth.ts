export type ToolResult = {
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

type DeviceTokenSuccess = {
  access_token: string;
  taskbounty_user_id?: string;
};

type DeviceLoginDeps = {
  siteOrigin: string;
  credentialPath: string;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  sleepMs?: (ms: number) => Promise<void>;
  persistToken: (accessToken: string, userId?: string) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function approvalMessage(start: DeviceStart): string {
  return (
    `Open this URL in your browser and approve:\n  ${start.verification_uri_complete}\n` +
    `Your code: ${start.user_code}\n` +
    `(If the link does not prefill, go to ${start.verification_uri} and enter the code.)\n\n` +
    "Waiting for approval..."
  );
}

async function readDeviceError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
}

export async function runDeviceLogin(clientName: string, deps: DeviceLoginDeps): Promise<ToolResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const nowMs = deps.nowMs ?? Date.now;
  const sleepMs = deps.sleepMs ?? defaultSleep;

  let start: DeviceStart;
  try {
    const res = await fetchFn(`${deps.siteOrigin}/api/mcp/device/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_name: clientName }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        content: [
          {
            type: "text",
            text: `Could not start login (HTTP ${res.status}) from ${deps.siteOrigin}/api/mcp/device/start\n\n${body}`,
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

  const instruction = approvalMessage(start);
  const deadline = nowMs() + start.expires_in * 1000;
  let intervalMs = Math.max(1, start.interval) * 1000;

  while (nowMs() < deadline) {
    await sleepMs(intervalMs);

    let res: Response;
    try {
      res = await fetchFn(`${deps.siteOrigin}/api/mcp/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ device_code: start.device_code }),
      });
    } catch {
      continue;
    }

    if (res.ok) {
      const data = (await res.json()) as DeviceTokenSuccess;
      try {
        deps.persistToken(data.access_token, data.taskbounty_user_id);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `${instruction}\n\nLogin succeeded but could not write ${deps.credentialPath}: ${err instanceof Error ? err.message : String(err)}. Retry after fixing that path, or set TASKBOUNTY_API_KEY manually.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text:
              `${instruction}\n\nLogged in. Credentials saved to ${deps.credentialPath} (mode 0600).\n` +
              "You can now use autopilot_enable and post_from_issue.",
          },
        ],
      };
    }

    const errCode = await readDeviceError(res);
    if (errCode === "authorization_pending") {
      continue;
    }
    if (errCode === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (errCode === "access_denied") {
      return {
        content: [
          {
            type: "text",
            text: `${instruction}\n\nLogin was denied in the browser. Run taskbounty_login again to retry.`,
          },
        ],
        isError: true,
      };
    }
    if (errCode === "expired_token") {
      return {
        content: [
          {
            type: "text",
            text: `${instruction}\n\nLogin code expired before approval. Run taskbounty_login again to retry.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${instruction}\n\nLogin failed (HTTP ${res.status}, error="${errCode}"). Run taskbounty_login again to retry.`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `${instruction}\n\nLogin timed out waiting for browser approval. Run taskbounty_login again to retry.`,
      },
    ],
    isError: true,
  };
}
