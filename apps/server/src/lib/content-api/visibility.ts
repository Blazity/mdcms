import type { ContentDocument } from "./types.js";

export function matchesDeletedListVisibility(
  document: Pick<ContentDocument, "isDeleted">,
  options: {
    draft: boolean;
    isDeleted?: boolean;
  },
): boolean {
  if (options.isDeleted !== undefined) {
    return document.isDeleted === options.isDeleted;
  }

  if (options.draft) {
    return document.isDeleted === false;
  }

  return true;
}
