"use client";

import type { AssistantProposal } from "./assistant-types.js";

const FAMILY_BY_KIND: Record<AssistantProposal["kind"], Family> = {
  insert_block: "additive",
  create_document: "additive",
  delete_document: "destructive",
  replace_selection: "replacing",
  update_frontmatter: "replacing",
};

// "structural" has no caller today — kept in the union + path table so
// future move/restructure/reorder proposals can opt into the existing
// glyph (mirrors the design's KindGlyph). Drop if it's still unused
// when those proposal kinds land elsewhere.
type Family = "additive" | "destructive" | "replacing" | "structural";

/**
 * Tiny semantic glyph that pairs with the kind chip on a proposal row.
 * Always renders an SVG — every `AssistantProposal["kind"]` is mapped
 * in `FAMILY_BY_KIND`. Color inherits from the chip's text color via
 * `currentColor`; the caller controls hue by wrapping with
 * `text-primary` (blue) or `text-accent-amber` (amber).
 */
export function KindGlyph({ kind }: { kind: AssistantProposal["kind"] }) {
  const family = FAMILY_BY_KIND[kind];
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 opacity-70"
    >
      {pathForFamily(family)}
    </svg>
  );
}

function pathForFamily(family: Family): React.JSX.Element {
  switch (family) {
    case "additive":
      return (
        <>
          <path d="M6 1.5v9" />
          <path d="M1.5 6h9" />
        </>
      );
    case "destructive":
      return (
        <>
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
          <path d="M3 3l6 6M9 3l-6 6" />
        </>
      );
    case "structural":
      return <path d="M2 4h7l-2-2M10 8H3l2 2" />;
    case "replacing":
      return (
        <>
          <path d="M2 3h6a2 2 0 0 1 2 2v3" />
          <path d="M9 7l1.5 1.5L9 10" />
          <path d="M3 3l-1.5 -1M3 3l-1.5 1" />
        </>
      );
  }
}
