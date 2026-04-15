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

export type SlashTriggerCoords = {
  top: number;
  left: number;
  cursorTop: number;
  cursorBottom: number;
};

export type SlashPickerLayout = {
  top: number;
  left: number;
  maxHeight: number;
};

const SLASH_PICKER_VIEWPORT_GUTTER = 12;
const SLASH_PICKER_TRIGGER_GAP = 8;

export function getSlashTriggerCoords(
  view: {
    coordsAtPos: (pos: number) => { top: number; left: number; bottom: number };
  },
  trigger: MdxComponentSlashTrigger,
  container: { getBoundingClientRect: () => { top: number; left: number } },
): SlashTriggerCoords {
  const cursorCoords = view.coordsAtPos(trigger.from);
  const containerRect = container.getBoundingClientRect();

  return {
    top: cursorCoords.bottom - containerRect.top,
    left: cursorCoords.left - containerRect.left,
    cursorTop: cursorCoords.top - containerRect.top,
    cursorBottom: cursorCoords.bottom - containerRect.top,
  };
}

export function getSlashPickerLayout(input: {
  anchor: SlashTriggerCoords;
  pickerSize: { width: number; height: number };
  containerRect: { top: number; left: number; width: number; height: number };
  viewportSize: { width: number; height: number };
  gutter?: number;
  gap?: number;
}): SlashPickerLayout {
  const gutter = input.gutter ?? SLASH_PICKER_VIEWPORT_GUTTER;
  const gap = input.gap ?? SLASH_PICKER_TRIGGER_GAP;
  const availableBelow = Math.max(
    input.viewportSize.height -
      gutter -
      (input.containerRect.top + input.anchor.cursorBottom + gap),
    0,
  );
  const availableAbove = Math.max(
    input.containerRect.top + input.anchor.cursorTop - gap - gutter,
    0,
  );
  const minLeft = gutter - input.containerRect.left;
  const maxLeft =
    input.viewportSize.width -
    gutter -
    input.containerRect.left -
    input.pickerSize.width;
  const left =
    maxLeft >= minLeft ? clamp(input.anchor.left, minLeft, maxLeft) : minLeft;

  if (input.pickerSize.height <= availableBelow) {
    return {
      top: input.anchor.cursorBottom + gap,
      left,
      maxHeight: availableBelow,
    };
  }

  if (input.pickerSize.height <= availableAbove) {
    return {
      top: input.anchor.cursorTop - gap - input.pickerSize.height,
      left,
      maxHeight: availableAbove,
    };
  }

  if (availableBelow >= availableAbove) {
    return {
      top: input.anchor.cursorBottom + gap,
      left,
      maxHeight: availableBelow,
    };
  }

  return {
    top: Math.max(
      gutter - input.containerRect.top,
      input.anchor.cursorTop - gap - availableAbove,
    ),
    left,
    maxHeight: availableAbove,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
