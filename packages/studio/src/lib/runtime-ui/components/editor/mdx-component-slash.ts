import type { Editor } from "@tiptap/core";

import type { StudioMountContext } from "@mdcms/shared";

import { createMdxComponentInsertContent } from "./mdx-component-catalog.js";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

export type MdxComponentSlashTrigger = {
  query: string;
  from: number;
  to: number;
};

const MDX_COMPONENT_SLASH_QUERY_PATTERN = /(?:^|\s)\/([A-Za-z0-9._-]*)$/;

export function getMdxComponentSlashTrigger(
  editor: Editor,
): MdxComponentSlashTrigger | null {
  const { selection } = editor.state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;
  const parent = $from.parent;

  if (!parent.isTextblock) {
    return null;
  }

  const textBefore = parent.textBetween(0, $from.parentOffset, undefined, "");
  const match = MDX_COMPONENT_SLASH_QUERY_PATTERN.exec(textBefore);

  if (!match) {
    return null;
  }

  const prefix = match[0];
  const query = match[1] ?? "";
  const slashOffset =
    textBefore.length - prefix.length + (prefix.startsWith(" ") ? 1 : 0);

  return {
    query,
    from: $from.pos - ($from.parentOffset - slashOffset),
    to: $from.pos,
  };
}

export function replaceSlashTriggerWithMdxComponent(
  editor: Editor,
  trigger: MdxComponentSlashTrigger,
  component: MdxCatalogComponent,
  props: Record<string, unknown> = {},
): boolean {
  return editor.commands.insertContentAt(
    {
      from: trigger.from,
      to: trigger.to,
    },
    createMdxComponentInsertContent(component, props),
  );
}
