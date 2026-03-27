import type { ContentVersionDocumentResponse } from "@mdcms/shared";

export type DocumentVersionDiffBodyLineStatus =
  | "unchanged"
  | "added"
  | "removed"
  | "changed";

export type DocumentVersionDiffFrontmatterChange = {
  path: string;
  before: unknown;
  after: unknown;
};

export type DocumentVersionDiffBodyLine = {
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  leftText: string | null;
  rightText: string | null;
  status: DocumentVersionDiffBodyLineStatus;
};

export type DocumentVersionDiff = {
  leftVersion: number;
  rightVersion: number;
  path: {
    before: string;
    after: string;
    changed: boolean;
  };
  frontmatter: {
    changed: boolean;
    changes: DocumentVersionDiffFrontmatterChange[];
  };
  body: {
    changed: boolean;
    lines: DocumentVersionDiffBodyLine[];
  };
};

type JsonLikeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonLikeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((entry, index) => isEqualValue(entry, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) {
        return false;
      }

      const key = leftKeys[index];
      if (!isEqualValue(left[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function collectFrontmatterChanges(
  left: unknown,
  right: unknown,
  path: string,
  changes: DocumentVersionDiffFrontmatterChange[],
): void {
  if (isEqualValue(left, right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);

    for (let index = 0; index < maxLength; index += 1) {
      collectFrontmatterChanges(
        left[index],
        right[index],
        `${path}[${index}]`,
        changes,
      );
    }

    return;
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = Array.from(
      new Set([...Object.keys(left), ...Object.keys(right)]),
    ).sort();

    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      collectFrontmatterChanges(left[key], right[key], nextPath, changes);
    }

    return;
  }

  changes.push({
    path,
    before: left,
    after: right,
  });
}

function compareBodyLines(
  left: string,
  right: string,
): DocumentVersionDiffBodyLine[] {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const lineCount = Math.max(leftLines.length, rightLines.length);
  const lines: DocumentVersionDiffBodyLine[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const leftText = leftLines[index] ?? null;
    const rightText = rightLines[index] ?? null;

    if (leftText === null && rightText === null) {
      continue;
    }

    if (leftText === null) {
      lines.push({
        leftLineNumber: null,
        rightLineNumber: index + 1,
        leftText: null,
        rightText,
        status: "added",
      });
      continue;
    }

    if (rightText === null) {
      lines.push({
        leftLineNumber: index + 1,
        rightLineNumber: null,
        leftText,
        rightText: null,
        status: "removed",
      });
      continue;
    }

    lines.push({
      leftLineNumber: index + 1,
      rightLineNumber: index + 1,
      leftText,
      rightText,
      status: leftText === rightText ? "unchanged" : "changed",
    });
  }

  return lines;
}

export function diffDocumentVersions(
  left: ContentVersionDocumentResponse,
  right: ContentVersionDocumentResponse,
): DocumentVersionDiff {
  const frontmatterChanges: DocumentVersionDiffFrontmatterChange[] = [];
  collectFrontmatterChanges(
    left.frontmatter,
    right.frontmatter,
    "",
    frontmatterChanges,
  );

  return {
    leftVersion: left.version,
    rightVersion: right.version,
    path: {
      before: left.path,
      after: right.path,
      changed: left.path !== right.path,
    },
    frontmatter: {
      changed: frontmatterChanges.length > 0,
      changes: frontmatterChanges,
    },
    body: {
      changed: !isEqualValue(left.body, right.body),
      lines: compareBodyLines(left.body, right.body),
    },
  };
}
