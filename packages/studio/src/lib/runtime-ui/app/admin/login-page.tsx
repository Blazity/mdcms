"use client";

import { useState, useEffect } from "react";
import { useRouter, useBasePath } from "../../navigation.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { MDCMSLogo } from "../../components/mdcms-logo.js";
import { createLoginApi, type SsoProvider } from "../../../login-api.js";
import { useStudioSession } from "./session-context.js";
import { useStudioMountInfo } from "./mount-info-context.js";

function useReturnTo(): string {
  if (typeof window === "undefined") return "/admin";

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") ?? "/admin";

  return returnTo.startsWith("/admin") ? returnTo : "/admin";
}

function stripAdminPrefix(path: string): string {
  return path.startsWith("/admin") ? path.slice("/admin".length) : path;
}

export default function LoginPage() {
  const router = useRouter();
  const basePath = useBasePath();
  const sessionState = useStudioSession();
  const mountInfo = useStudioMountInfo();
  const returnTo = useReturnTo();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const [ssoLoading, setSsoLoading] = useState(true);

  useEffect(() => {
    if (sessionState.status === "authenticated") {
      router.replace(returnTo);
    }
  }, [sessionState.status, returnTo, router]);

  useEffect(() => {
    if (!mountInfo.apiBaseUrl) {
      setSsoLoading(false);
      return;
    }

    let cancelled = false;
    const api = createLoginApi({ serverUrl: mountInfo.apiBaseUrl });

    void api
      .getSsoProviders()
      .then((providers) => {
        if (!cancelled) {
          setSsoProviders(providers);
          setSsoLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSsoProviders([]);
          setSsoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mountInfo.apiBaseUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const api = createLoginApi({ serverUrl: mountInfo.apiBaseUrl });
    const result = await api.login(email, password);

    setSubmitting(false);

    switch (result.outcome) {
      case "success":
        window.location.href = basePath
          ? `${basePath}${stripAdminPrefix(returnTo)}`
          : returnTo;
        break;
      case "invalid_credentials":
        setError("Invalid email or password.");
        break;
      case "throttled":
        setError(
          `Too many attempts. Try again in ${result.retryAfterSeconds}s.`,
        );
        break;
      case "error":
        setError(result.message);
        break;
    }
  };

  const handleSsoClick = (providerId: string) => {
    const callbackURL = basePath
      ? `${basePath}${stripAdminPrefix(returnTo)}`
      : returnTo;

    void fetch(`${mountInfo.apiBaseUrl}/api/v1/auth/sign-in/sso`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId, callbackURL }),
      redirect: "manual",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => undefined);
        const redirectUrl =
          body && typeof body === "object" && typeof body.url === "string"
            ? body.url
            : null;
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          setError("SSO provider did not return a redirect. Please try again.");
        }
      })
      .catch(() => {
        setError("SSO sign-in failed. Please try again.");
      });
  };

  if (sessionState.status === "authenticated") {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-4">
            <MDCMSLogo collapsed={false} />
          </div>
          <p className="text-sm text-foreground-muted">
            Sign in to your workspace
          </p>
        </div>

        {!ssoLoading && ssoProviders.length > 0 && (
          <>
            <div className="space-y-2">
              {ssoProviders.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSsoClick(provider.id)}
                >
                  Continue with {provider.name}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-foreground-muted uppercase">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="login-email"
              className="text-sm font-medium text-foreground"
            >
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-accent hover:bg-accent-hover text-white"
            disabled={submitting || !email || !password}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
