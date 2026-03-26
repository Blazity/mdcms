import { defineConfig, defineType, reference } from "@mdcms/cli";
import { z } from "zod";

import {
  studioExampleEnvironment,
  studioExampleMdxComponents,
  studioExampleProject,
  studioExampleServerUrl,
} from "./lib/studio-example-studio-config";

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

export default defineConfig({
  project: studioExampleProject,
  environment: studioExampleEnvironment,
  serverUrl: studioExampleServerUrl,
  contentDirectories: ["content"],
  environments: {
    production: {},
    staging: {
      extends: "production",
    },
  },
  components: [...studioExampleMdxComponents],
  types: [post, author, page],
});
