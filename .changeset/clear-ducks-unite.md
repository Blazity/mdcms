---
"@mdcms/shared": patch
"@mdcms/studio": patch
---

Reduce the Studio runtime bundle size by keeping Node-side MDX prop extraction out of the browser runtime and emitting optimized production runtime assets.
