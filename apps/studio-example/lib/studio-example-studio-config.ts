export const studioExampleProject = "marketing-site";
export const studioExampleEnvironment = "staging";
export const studioExampleServerUrl = "http://localhost:4000";

/**
 * Derive the server URL from the browser's current hostname so that
 * loopback access via `127.0.0.1` stays same-site with the API server.
 * Falls back to the static default for SSR / non-browser contexts.
 */
export function resolveStudioExampleServerUrl(): string {
  if (typeof window === "undefined") return studioExampleServerUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
}
export const studioExampleLocales = {
  default: "en",
  supported: ["en", "fr"],
} as const;

export const studioExampleMdxComponents = [
  {
    name: "Chart",
    importPath: "./components/mdx/Chart",
    description: "Compact chart card for testing void MDX insertion.",
    load: () =>
      import("../components/mdx/Chart").then((module) => module.Chart),
    propHints: {
      color: {
        widget: "color-picker",
      } as const,
    },
  },
  {
    name: "Callout",
    importPath: "./components/mdx/Callout",
    description: "Wrapper callout block for testing nested MDX body editing.",
    load: () =>
      import("../components/mdx/Callout").then((module) => module.Callout),
  },
  {
    name: "PricingTable",
    importPath: "./components/mdx/PricingTable",
    description: "Pricing grid with a custom props editor for tier management.",
    load: () =>
      import("../components/mdx/PricingTable").then(
        (module) => module.PricingTable,
      ),
    propsEditor: "./components/mdx/PricingTable.editor",
    loadPropsEditor: () =>
      import("../components/mdx/PricingTable.editor").then(
        (module) => module.default,
      ),
  },
] as const;
