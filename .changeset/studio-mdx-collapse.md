---
"@mdcms/studio": patch
---

Add a collapse/expand affordance to MDX components in the Studio editor. Each component block now exposes a chevron in its chip row that hides the preview surface and the editable child slot while keeping them mounted (so ProseMirror keeps tracking content). When collapsed, the chip surfaces an inline props summary so editors can identify the block without expanding it. A `Collapse all` / `Expand all` toggle in the editor toolbar broadcasts the desired state to every component in the document; individual blocks can still be toggled afterwards. Collapse state is ephemeral UI state — it never persists into the stored markdown/MDX.
