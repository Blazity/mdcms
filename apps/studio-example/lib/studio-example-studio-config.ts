export const studioExampleProject = "marketing-site";
export const studioExampleEnvironment = "staging";
export const studioExampleServerUrl = "http://localhost:4000";
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

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeConfiguredServerUrl(url: URL): string {
  const pathname = url.pathname.replace(/\/$/, "");
  return `${url.origin}${pathname}`;
}

function parseHostHeaderHostname(requestHost: string | undefined): string | null {
  if (!requestHost) {
    return null;
  }

  const firstHost = requestHost.split(",")[0]?.trim();

  if (!firstHost) {
    return null;
  }

  try {
    return new URL(`http://${firstHost}`).hostname;
  } catch {
    return null;
  }
}

export function resolveStudioExampleServerUrl(requestHost?: string): string {
  const serverUrl = new URL(studioExampleServerUrl);
  const requestHostname = parseHostHeaderHostname(requestHost);

  if (
    requestHostname &&
    LOOPBACK_HOSTNAMES.has(serverUrl.hostname) &&
    LOOPBACK_HOSTNAMES.has(requestHostname)
  ) {
    serverUrl.hostname = requestHostname;
  }

  return normalizeConfiguredServerUrl(serverUrl);
}
