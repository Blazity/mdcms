export type LoginApiConfig = {
  serverUrl: string;
};

export type LoginApiOptions = {
  fetcher?: typeof fetch;
};

export type LoginResult =
  | { outcome: "success" }
  | { outcome: "invalid_credentials" }
  | { outcome: "throttled"; retryAfterSeconds: number }
  | { outcome: "error"; message: string };

export type SsoProvider = {
  id: string;
  name: string;
};

export type LoginApi = {
  login: (email: string, password: string) => Promise<LoginResult>;
  getSsoProviders: () => Promise<SsoProvider[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createLoginApi(
  config: LoginApiConfig,
  options: LoginApiOptions = {},
): LoginApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    async login(email, password) {
      let response: Response;

      try {
        response = await fetcher(
          new URL("/api/v1/auth/login", config.serverUrl),
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
          },
        );
      } catch (error) {
        return {
          outcome: "error",
          message:
            error instanceof Error ? error.message : "Login request failed.",
        };
      }

      if (response.ok) {
        return { outcome: "success" };
      }

      if (response.status === 401) {
        return { outcome: "invalid_credentials" };
      }

      if (response.status === 429) {
        let retryAfterSeconds = 5;
        try {
          const payload = await response.json();
          if (
            isRecord(payload) &&
            isRecord(payload.details) &&
            typeof payload.details.retryAfterSeconds === "number"
          ) {
            retryAfterSeconds = payload.details.retryAfterSeconds;
          }
        } catch {
          /* use default */
        }
        return { outcome: "throttled", retryAfterSeconds };
      }

      return { outcome: "error", message: "Login failed. Please try again." };
    },

    async getSsoProviders() {
      try {
        const response = await fetcher(
          new URL("/api/v1/auth/sso/providers", config.serverUrl),
          { method: "GET", credentials: "include" },
        );
        if (!response.ok) return [];
        const payload = await response.json();
        if (isRecord(payload) && Array.isArray(payload.data)) {
          return payload.data as SsoProvider[];
        }
        return [];
      } catch {
        return [];
      }
    },
  };
}
