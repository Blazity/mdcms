---
"@mdcms/studio": patch
---

Add a System/Light/Dark theme picker in the admin header, default the Studio theme to System so it follows the OS preference, and theme the bootstrap loading shell (`Loading Studio`) so it resolves from `localStorage` + `prefers-color-scheme` instead of always rendering light. `StudioShellFrame` gains an optional `shellTheme` prop (defaulted to `"light"`, non-breaking).
