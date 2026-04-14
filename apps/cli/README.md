# @mdcms/cli

CLI for MDCMS content workflows — pull content to local Markdown files, edit with any tool, and push changes back.

## Install

```bash
npm install @mdcms/cli
```

## Configuration

Create a `mdcms.config.ts` in your project root:

```ts
import { defineConfig, defineType, reference } from "@mdcms/cli";
import { z } from "zod";

export default defineConfig({
  project: "marketing-site",
  environment: "staging",
  serverUrl: "http://localhost:4000",
  contentDirectories: ["content"],
  types: [
    defineType("Author", {
      directory: "content/authors",
      fields: {
        name: z.string().min(1),
      },
    }),
    defineType("BlogPost", {
      directory: "content/blog",
      localized: true,
      fields: {
        title: z.string().min(1),
        author: reference("Author"),
      },
    }),
  ],
  locales: {
    default: "en-US",
    supported: ["en-US", "fr"],
  },
});
```

## Commands

| Command | Description |
| --- | --- |
| `mdcms login` | Authenticate via browser-based OAuth flow |
| `mdcms logout` | Revoke credentials and clear local profile |
| `mdcms pull` | Pull content from the server to local Markdown files |
| `mdcms push` | Push local content changes back to the server |
| `mdcms schema sync` | Sync your local schema definition to the server registry |

### Pull

```bash
mdcms pull              # Interactive mode — prompts before overwriting
mdcms pull --force      # Skip overwrite prompts
mdcms pull --dry-run    # Preview changes without writing files
mdcms pull --published  # Fetch published snapshots instead of drafts
```

### Push

```bash
mdcms push              # Interactive mode — prompts before uploading
mdcms push --force      # Skip confirmation prompt
mdcms push --dry-run    # Preview changes without uploading
```

### Global Flags

| Flag | Env Variable | Description |
| --- | --- | --- |
| `--project` | `MDCMS_PROJECT` | Target project name |
| `--environment` | `MDCMS_ENVIRONMENT` | Target environment name |
| `--server-url` | `MDCMS_SERVER_URL` | Server URL |
| `--api-key` | `MDCMS_API_KEY` | API key (for headless/CI use) |
| `--config` | | Path to config file (default: `mdcms.config.ts`) |

## Documentation

Full CLI reference at [docs.mdcms.ai](https://docs.mdcms.ai/).
