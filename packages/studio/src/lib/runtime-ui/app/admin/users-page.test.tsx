import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "../../adapters/next-themes.js";
import { ToastProvider } from "../../components/toast.js";
import { StudioNavigationProvider } from "../../navigation.js";
import {
  AdminCapabilitiesProvider,
  type AdminCapabilitiesValue,
} from "./capabilities-context.js";
import { StudioMountInfoProvider } from "./mount-info-context.js";
import { StudioSessionProvider } from "./session-context.js";
import UsersPage from "./users-page.js";

function renderUsersPage(input: {
  capabilities?: Partial<AdminCapabilitiesValue>;
}): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ThemeProvider,
        null,
        createElement(
          StudioNavigationProvider,
          {
            value: {
              pathname: "/admin/users",
              params: {},
              basePath: "/admin",
              push: () => {},
              replace: () => {},
              back: () => {},
            },
          },
          createElement(
            AdminCapabilitiesProvider,
            {
              value: {
                canReadSchema: true,
                canCreateContent: false,
                canPublishContent: false,
                canUnpublishContent: false,
                canDeleteContent: false,
                canManageUsers: false,
                canManageSettings: false,
                ...input.capabilities,
              },
            },
            createElement(
              StudioMountInfoProvider,
              {
                value: {
                  project: "test-project",
                  environment: "production",
                  apiBaseUrl: "https://api.example.com",
                  auth: { mode: "cookie" as const },
                  environments: [],
                  hostBridge: null,
                  setEnvironment: () => {},
                },
              },
              createElement(
                StudioSessionProvider,
                {
                  value: {
                    status: "authenticated" as const,
                    session: {
                      id: "sess-1",
                      userId: "user-1",
                      email: "test@example.com",
                      issuedAt: new Date().toISOString(),
                      expiresAt: new Date(
                        Date.now() + 86400000,
                      ).toISOString(),
                    },
                    csrfToken: "test-csrf-token",
                  },
                },
                createElement(
                  ToastProvider,
                  null,
                  createElement(UsersPage),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

test("UsersPage shows access denied when canManageUsers is false", () => {
  const markup = renderUsersPage({ capabilities: { canManageUsers: false } });
  assert.match(markup, /Access denied/);
  assert.doesNotMatch(markup, /Invite User/);
});

test("UsersPage renders user management when canManageUsers is true", () => {
  const markup = renderUsersPage({ capabilities: { canManageUsers: true } });
  assert.match(markup, /Invite User/);
  assert.doesNotMatch(markup, /Access denied/);
});

test("UsersPage does not render a Last Active column", () => {
  const markup = renderUsersPage({ capabilities: { canManageUsers: true } });
  assert.doesNotMatch(markup, /Last Active/);
});
