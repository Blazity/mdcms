import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "../../adapters/next-themes.js";
import { StudioNavigationProvider } from "../../navigation.js";
import {
  AdminCapabilitiesProvider,
  type AdminCapabilitiesValue,
} from "./capabilities-context.js";
import { StudioMountInfoProvider } from "./mount-info-context.js";
import SettingsPage from "./settings-page.js";

function renderSettingsPage(input: {
  initialTab: string;
  basePath?: string;
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
              pathname: "/admin/settings",
              params: {},
              basePath: input.basePath ?? "/admin",
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
              createElement(SettingsPage, {
                initialTab: input.initialTab,
              }),
            ),
          ),
        ),
      ),
    ),
  );
}

test("SettingsPage renders the API keys tab header and create button", () => {
  const markup = renderSettingsPage({
    initialTab: "api-keys",
    capabilities: { canManageSettings: true },
  });

  assert.match(markup, /Create API Key/);
  assert.match(markup, /Manage API keys for external integrations/);
});

test("SettingsPage does not render a Schema tab", () => {
  const markup = renderSettingsPage({
    initialTab: "general",
    capabilities: { canManageSettings: true },
  });
  assert.doesNotMatch(markup, /Open schema browser/);
  assert.doesNotMatch(markup, /data-mdcms-settings-schema-state/);
});

test("SettingsPage shows access denied when canManageSettings is false", () => {
  const markup = renderSettingsPage({
    initialTab: "api-keys",
    capabilities: { canManageSettings: false },
  });
  assert.match(markup, /Access denied/);
  assert.doesNotMatch(markup, /Create API Key/);
});

test("SettingsPage renders content when canManageSettings is true", () => {
  const markup = renderSettingsPage({
    initialTab: "api-keys",
    capabilities: { canManageSettings: true },
  });
  assert.match(markup, /Create API Key/);
  assert.doesNotMatch(markup, /Access denied/);
});

test("SettingsPage does not render Webhooks or Media tabs", () => {
  const markup = renderSettingsPage({
    initialTab: "general",
    capabilities: { canManageSettings: true },
  });
  assert.doesNotMatch(markup, /Webhooks/);
  assert.doesNotMatch(markup, /Media/);
});

test("SettingsPage General tab shows read-only project context", () => {
  const markup = renderSettingsPage({
    initialTab: "general",
    capabilities: { canManageSettings: true },
  });
  assert.match(markup, /read-only/i);
  assert.doesNotMatch(markup, /Save changes/);
});
