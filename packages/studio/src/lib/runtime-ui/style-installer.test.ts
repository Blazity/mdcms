// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "bun:test";

import { installStudioRuntimeStyles } from "./style-installer.js";

type FakeLinkNode = {
  tagName: string;
  rel: string;
  href: string;
  dataset: Record<string, string>;
  parentNode: FakeHeadNode | null;
  remove: () => void;
};

type FakeHeadNode = {
  children: FakeLinkNode[];
  appendChild: (node: FakeLinkNode) => FakeLinkNode;
};

function createFakeDocument(): {
  document: {
    head: FakeHeadNode;
    createElement: (tagName: string) => FakeLinkNode;
    querySelector: (selector: string) => FakeLinkNode | null;
  };
  head: FakeHeadNode;
} {
  const head: FakeHeadNode = {
    children: [],
    appendChild(node) {
      node.parentNode = head;
      head.children.push(node);
      return node;
    },
  };

  const document = {
    head,
    createElement(tagName: string) {
      return {
        tagName: tagName.toUpperCase(),
        rel: "",
        href: "",
        dataset: {},
        parentNode: null,
        remove() {
          if (!this.parentNode) {
            return;
          }

          this.parentNode.children = this.parentNode.children.filter(
            (child) => child !== this,
          );
          this.parentNode = null;
        },
      };
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
