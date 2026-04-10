import { defineConfig, defineType, reference } from "@mdcms/cli";
import { z } from "zod";

import {
  studioReviewEnvironment,
  studioReviewMdxComponents,
  studioReviewProject,
  studioReviewServerUrl,
} from "./lib/review-studio-config";

const post = defineType("post", {
  directory: "content/posts",
  fields: {
    title: z.string().min(1),
    slug: z.string().min(1),
    featured: z.boolean().default(false).env("staging"),
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
  project: studioReviewProject,
  environment: studioReviewEnvironment,
  serverUrl: studioReviewServerUrl,
  contentDirectories: ["content"],
  environments: {
    production: {},
    staging: {
      extends: "production",
    },
  },
  components: [...studioReviewMdxComponents],
  types: [post, author, page],
});
