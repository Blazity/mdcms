import assert from "node:assert/strict";
import { test } from "bun:test";

import { installStudioRuntimeStyles } from "./style-installer.js";

type RuntimeStylesheetDocument = NonNullable<
  Parameters<typeof installStudioRuntimeStyles>[1]
>;
type RuntimeStylesheetNode = ReturnType<
  RuntimeStylesheetDocument["createElement"]
>;

type FakeLinkNode = RuntimeStylesheetNode & {
  tagName: string;
  parentNode: FakeHeadNode | null;
};

type FakeHeadNode = RuntimeStylesheetDocument["head"] & {
  children: FakeLinkNode[];
};

function createFakeDocument(): {
  document: RuntimeStylesheetDocument;
  head: FakeHeadNode;
} {
  const head: FakeHeadNode = {
    children: [],
    appendChild(node) {
      const linkNode = node as FakeLinkNode;
      linkNode.parentNode = head;
      head.children.push(linkNode);
      return linkNode;
    },
  };

  const document: RuntimeStylesheetDocument = {
    head,
    createElement(tagName: string) {
      const linkNode: FakeLinkNode = {
        tagName: tagName.toUpperCase(),
        rel: "",
        href: "",
        dataset: {},
        parentNode: null,
        remove() {
          if (!linkNode.parentNode) {
            return;
          }

          linkNode.parentNode.children = linkNode.parentNode.children.filter(
            (child: FakeLinkNode) => child !== linkNode,
          );
          linkNode.parentNode = null;
        },
      };

      return linkNode;
    },
    querySelector(selector: string) {
      const matchedHref = selector.match(/href="([^"]+)"/)?.[1];
      if (!matchedHref) {
        return null;
      }

      return (
        head.children.find(
          (child) =>
            child.tagName === "LINK" &&
            child.dataset.mdcmsStudioRuntimeStyles === "true" &&
            child.href === matchedHref,
        ) ?? null
      );
    },
  };

  return { document, head };
}

test("installStudioRuntimeStyles reuses an existing stylesheet link and removes it after the last cleanup", () => {
  const { document, head } = createFakeDocument();

  const cleanupA = installStudioRuntimeStyles(
    "http://example.test/runtime.css",
    document,
  );
  const cleanupB = installStudioRuntimeStyles(
    "http://example.test/runtime.css",
    document,
  );

  assert.equal(head.children.length, 1);
  assert.equal(head.children[0]?.rel, "stylesheet");
  assert.equal(head.children[0]?.dataset.mdcmsStudioRuntimeRefCount, "2");

  cleanupA();

  assert.equal(head.children.length, 1);
  assert.equal(head.children[0]?.dataset.mdcmsStudioRuntimeRefCount, "1");

  cleanupB();

  assert.equal(head.children.length, 0);
});
