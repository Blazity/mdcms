---
"@mdcms/studio": patch
---

Add an `EmptyParagraphHint` ProseMirror plugin to the default Studio editor
extensions. The plugin annotates the empty top-level paragraph that holds
the caret with `data-mdcms-empty-hint="true"`, which the runtime stylesheet
uses to render the "Type / to insert a component…" affordance via an
absolutely-positioned `::before`. The decoration is scoped to focused doc-
root paragraphs only — list items, blockquotes, code blocks, and MDX
wrappers do not surface the hint, since `/` does not insert a component
there.

Hosts that compose `createEditorExtensions(...)` automatically pick up the
new extension; no host migration is required and no public API has
changed.
