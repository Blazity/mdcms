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
            createElement(SettingsPage, {
              initialTab: input.initialTab,
            }),
          ),
        ),
      ),
    ),
  );
}

test("SettingsPage renders the API keys tab header and create button", () => {
  const markup = renderSettingsPage({
    initialTab: "api-keys",
  });

  assert.match(markup, /Create API Key/);
  assert.match(markup, /Manage API keys for external integrations/);
});

test("SettingsPage hides the schema browser CTA when schema.read is unavailable", () => {
  const markup = renderSettingsPage({
    initialTab: "schema",
    capabilities: {
      canReadSchema: false,
    },
  });

  assert.doesNotMatch(markup, /data-mdcms-settings-schema-state="linked"/);
  assert.doesNotMatch(markup, /Open schema browser/);
});

test("SettingsPage uses the active Studio base path for the schema browser link", () => {
  const markup = renderSettingsPage({
    initialTab: "schema",
    basePath: "/embedded/studio",
  });

  assert.match(markup, /href="\/embedded\/studio\/schema"/);
});
