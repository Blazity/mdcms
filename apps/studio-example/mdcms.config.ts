import type { MdcmsConfig } from "@mdcms/studio";

const config: MdcmsConfig = {
  project: "marketing-site",
  environment: "staging",
  serverUrl: "http://localhost:4000",
  types: [
    {
      name: "post",
      directory: "content/posts",
      localized: false,
    },
    {
      name: "page",
      directory: "content/pages",
      localized: false,
    },
  ],
};

export default config;
