export const studioReviewProject = "marketing-site";
export const studioReviewEnvironment = "staging";
export const studioReviewServerUrl = "http://127.0.0.1:3000";

export const studioReviewMdxComponents = [
  {
    name: "Chart",
    importPath: "./components/mdx/Chart",
    description: "Compact chart card for deterministic review previews.",
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
    description: "Wrapper callout block for nested MDX review scenarios.",
    load: () =>
      import("../components/mdx/Callout").then((module) => module.Callout),
  },
  {
    name: "PricingTable",
    importPath: "./components/mdx/PricingTable",
    description: "Pricing grid with a custom props editor for review flows.",
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
