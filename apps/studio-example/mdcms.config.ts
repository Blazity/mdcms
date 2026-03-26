import { defineConfig, defineType, reference } from "@mdcms/cli";
import { z } from "zod";

const post = defineType("post", {
  directory: "content/posts",
  fields: {
    title: z.string().min(1),
    slug: z.string().min(1),
    author: reference("author").optional(),
  },
});

const author = defineType("author", {
  directory: "content/authors",
  fields: {
    name: z.string().min(1),
  },
});

const page = defineType("page", {
  directory: "content/pages",
  fields: {
    title: z.string().min(1),
  },
});

const components = [
  {
    name: "Chart",
    importPath: "./components/mdx/Chart",
    description: "Compact chart card for testing void MDX insertion.",
    load: () => import("./components/mdx/Chart").then((module) => module.Chart),
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
      import("./components/mdx/Callout").then((module) => module.Callout),
  },
  {
    name: "PricingTable",
    importPath: "./components/mdx/PricingTable",
    description: "Pricing grid with a custom props editor for tier management.",
    load: () =>
      import("./components/mdx/PricingTable").then(
        (module) => module.PricingTable,
      ),
    propsEditor: "./components/mdx/PricingTable.editor",
    loadPropsEditor: () =>
      import("./components/mdx/PricingTable.editor").then(
        (module) => module.default,
      ),
  },
] as const;

export default defineConfig({
  project: "marketing-site",
  environment: "staging",
  serverUrl: "http://localhost:4000",
  contentDirectories: ["content"],
  environments: {
    production: {},
    staging: {
      extends: "production",
    },
  },
  components: [...components],
  types: [post, author, page],
});
