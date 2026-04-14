"use client";

import { useState } from "react";
import { useParams } from "../../navigation.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Label } from "../../components/ui/label.js";
import { MDCMSLogo } from "../../components/mdcms-logo.js";

type InviteAcceptPageProps = {
  /** Override the token from route params (useful for tests). */
  token?: string;
  serverUrl: string;
};

type PageState =
  | { status: "ready" }
  | { status: "submitting" }
  | { status: "accepted" }
  | { status: "already_accepted" }
  | { status: "expired" }
  | { status: "error"; message: string };

type AcceptErrorResponse = {
  code?: string;
  message?: string;
};

export default function InviteAcceptPage({
  token: tokenProp,
  serverUrl,
}: InviteAcceptPageProps) {
  const params = useParams<{ token?: string }>();
  const token = tokenProp ?? params.token ?? "";

  const [state, setState] = useState<PageState>({ status: "ready" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ status: "submitting" });

    try {
      const response = await fetch(
        `${serverUrl}/api/v1/auth/invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, password }),
        },
      );

      if (response.ok) {
        setState({ status: "accepted" });
        return;
      }

      const body = (await response.json().catch(() => undefined)) as
        | AcceptErrorResponse
        | undefined;

      const errorCode = body?.code;
      const errorMessage =
        body?.message ?? "Something went wrong. Please try again.";

      if (errorCode === "INVITE_EXPIRED" || errorCode === "INVITE_REVOKED") {
        setState({ status: "expired" });
        return;
      }

      if (errorCode === "INVITE_ALREADY_ACCEPTED") {
        setState({ status: "already_accepted" });
        return;
      }

      if (errorCode === "EMAIL_ALREADY_REGISTERED") {
        setState({
          status: "error",
          message:
            "A user with this email already exists. Try signing in instead.",
        });
        return;
      }

      if (errorCode === "NOT_FOUND" || errorCode === "INVITE_NOT_FOUND") {
        setState({
          status: "error",
          message: "This invitation link is invalid.",
        });
        return;
      }

      setState({ status: "error", message: errorMessage });
    } catch {
      setState({
        status: "error",
        message: "Network error. Please check your connection and try again.",
      });
    }
  };

  if (state.status === "accepted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-4">
              <MDCMSLogo collapsed={false} />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Account Created
            </h1>
            <p className="text-sm text-foreground-muted">
              Your account has been set up successfully. You can now sign in.
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              window.location.href = `${window.location.origin}${window.location.pathname.replace(/\/invite\/.*$/, "/login")}`;
            }}
          >
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-4">
              <MDCMSLogo collapsed={false} />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Invitation Expired
            </h1>
            <p className="text-sm text-foreground-muted">
              This invitation link is no longer valid. Please ask your
              administrator to send a new invitation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "already_accepted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-4">
              <MDCMSLogo collapsed={false} />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Already Accepted
            </h1>
            <p className="text-sm text-foreground-muted">
              This invitation has already been accepted. You can sign in with
              your account.
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              window.location.href = `${window.location.origin}${window.location.pathname.replace(/\/invite\/.*$/, "/login")}`;
            }}
          >
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  const isFormValid = name.trim().length > 0 && password.length >= 8;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-4">
            <MDCMSLogo collapsed={false} />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            Create Your Account
          </h1>
          <p className="text-sm text-foreground-muted">
            You have been invited to join the workspace. Fill in your details
            below to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {state.status === "error" && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              autoFocus
              disabled={state.status === "submitting"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-password">Password</Label>
            <Input
              id="invite-password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={state.status === "submitting"}
            />
            <p className="text-xs text-foreground-muted">
              Must be at least 8 characters
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={state.status === "submitting" || !isFormValid}
          >
            {state.status === "submitting"
              ? "Creating account..."
              : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
