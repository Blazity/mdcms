const STUDIO_RUNTIME_STYLE_FLAG = "mdcmsStudioRuntimeStyles";
const STUDIO_RUNTIME_STYLE_REFCOUNT = "mdcmsStudioRuntimeRefCount";

type RuntimeStylesheetNode = {
  rel: string;
  href: string;
  dataset: Record<string, string>;
  remove: () => void;
};

type RuntimeStylesheetDocument = {
  head: {
    appendChild: (node: RuntimeStylesheetNode) => unknown;
  };
  createElement: (tagName: string) => RuntimeStylesheetNode;
  querySelector: (selector: string) => RuntimeStylesheetNode | null;
};

function getDefaultDocument(): RuntimeStylesheetDocument | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  return document as unknown as RuntimeStylesheetDocument;
}

function createStylesheetSelector(stylesheetUrl: string): string {
  return `link[data-mdcms-studio-runtime-styles="true"][href="${stylesheetUrl}"]`;
}

function readRefCount(node: RuntimeStylesheetNode): number {
  return Number.parseInt(
    node.dataset[STUDIO_RUNTIME_STYLE_REFCOUNT] ?? "0",
    10,
  );
}

export function resolveStudioRuntimeStylesheetUrl(moduleUrl: string): string {
  return moduleUrl.replace(/\.(?:mjs|js|ts|tsx)(\?.*)?$/, ".css$1");
}

export function installStudioRuntimeStyles(
  stylesheetUrl: string,
  targetDocument: RuntimeStylesheetDocument | undefined = getDefaultDocument(),
): () => void {
  if (!targetDocument) {
    return () => {};
  }

  let linkNode =
    targetDocument.querySelector(createStylesheetSelector(stylesheetUrl)) ??
    undefined;

  if (!linkNode) {
    linkNode = targetDocument.createElement("link");
    linkNode.rel = "stylesheet";
    linkNode.href = stylesheetUrl;
    linkNode.dataset[STUDIO_RUNTIME_STYLE_FLAG] = "true";
    linkNode.dataset[STUDIO_RUNTIME_STYLE_REFCOUNT] = "0";
    targetDocument.head.appendChild(linkNode);
  }

  linkNode.dataset[STUDIO_RUNTIME_STYLE_REFCOUNT] = String(
    readRefCount(linkNode) + 1,
  );

  let cleanedUp = false;

  return () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    const nextRefCount = readRefCount(linkNode) - 1;

    if (nextRefCount <= 0) {
      linkNode.remove();
      return;
    }

    linkNode.dataset[STUDIO_RUNTIME_STYLE_REFCOUNT] = String(nextRefCount);
  };
}
