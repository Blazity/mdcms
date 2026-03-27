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

function normalizeBodyText(body: string): string {
  return body.replace(/\r\n?/g, "\n");
}

function splitBodyLines(body: string): string[] {
  if (body.length === 0) {
    return [];
  }

  return normalizeBodyText(body).split("\n");
}

const LCS_CELL_LIMIT = 4096;

function compareBodyLinesWithFallback(
  leftLines: string[],
  rightLines: string[],
): DocumentVersionDiffBodyLine[] {
  const lines: DocumentVersionDiffBodyLine[] = [];
  const leftCount = leftLines.length;
  const rightCount = rightLines.length;
  const shortestCount = Math.min(leftCount, rightCount);
  let prefixLength = 0;

  while (
    prefixLength < shortestCount &&
    leftLines[prefixLength] === rightLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;

  while (
    suffixLength < leftCount - prefixLength &&
    suffixLength < rightCount - prefixLength &&
    leftLines[leftCount - suffixLength - 1] ===
      rightLines[rightCount - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  for (let index = 0; index < prefixLength; index += 1) {
    lines.push({
      leftLineNumber: index + 1,
      rightLineNumber: index + 1,
      leftText: leftLines[index]!,
      rightText: rightLines[index]!,
      status: "unchanged",
    });
  }

  const leftMiddleStart = prefixLength;
  const rightMiddleStart = prefixLength;
  const leftMiddleCount = leftCount - prefixLength - suffixLength;
  const rightMiddleCount = rightCount - prefixLength - suffixLength;
  const pairedMiddleCount = Math.min(leftMiddleCount, rightMiddleCount);

  for (let index = 0; index < pairedMiddleCount; index += 1) {
    const leftText = leftLines[leftMiddleStart + index]!;
    const rightText = rightLines[rightMiddleStart + index]!;

    lines.push({
      leftLineNumber: leftMiddleStart + index + 1,
      rightLineNumber: rightMiddleStart + index + 1,
      leftText,
      rightText,
      status: leftText === rightText ? "unchanged" : "changed",
    });
  }

  for (let index = pairedMiddleCount; index < leftMiddleCount; index += 1) {
    lines.push({
      leftLineNumber: leftMiddleStart + index + 1,
      rightLineNumber: null,
      leftText: leftLines[leftMiddleStart + index]!,
      rightText: null,
      status: "removed",
    });
  }

  for (let index = pairedMiddleCount; index < rightMiddleCount; index += 1) {
    lines.push({
      leftLineNumber: null,
      rightLineNumber: rightMiddleStart + index + 1,
      leftText: null,
      rightText: rightLines[rightMiddleStart + index]!,
      status: "added",
    });
  }

  for (let index = 0; index < suffixLength; index += 1) {
    const leftIndex = leftCount - suffixLength + index;
    const rightIndex = rightCount - suffixLength + index;

    lines.push({
      leftLineNumber: leftIndex + 1,
      rightLineNumber: rightIndex + 1,
      leftText: leftLines[leftIndex]!,
      rightText: rightLines[rightIndex]!,
      status: "unchanged",
    });
  }

  return lines;
}

function compareBodyLinesWithLcs(
  leftLines: string[],
  rightLines: string[],
): DocumentVersionDiffBodyLine[] {
  const leftCount = leftLines.length;
  const rightCount = rightLines.length;
  const lines: DocumentVersionDiffBodyLine[] = [];

  const lcsLengths = Array.from({ length: leftCount + 1 }, () =>
    Array<number>(rightCount + 1).fill(0),
  );

  for (let leftIndex = leftCount - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightCount - 1; rightIndex >= 0; rightIndex -= 1) {
      lcsLengths[leftIndex]![rightIndex] =
        leftLines[leftIndex] === rightLines[rightIndex]
          ? lcsLengths[leftIndex + 1]![rightIndex + 1]! + 1
          : Math.max(
              lcsLengths[leftIndex + 1]![rightIndex]!,
              lcsLengths[leftIndex]![rightIndex + 1]!,
            );
    }
  }

  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < leftCount && rightIndex < rightCount) {
    const leftText = leftLines[leftIndex]!;
    const rightText = rightLines[rightIndex]!;

    if (leftText === rightText) {
      lines.push({
        leftLineNumber: leftIndex + 1,
        rightLineNumber: rightIndex + 1,
        leftText,
        rightText,
        status: "unchanged",
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    const skipLeft = lcsLengths[leftIndex + 1]![rightIndex]!;
    const skipRight = lcsLengths[leftIndex]![rightIndex + 1]!;
    const pairScore = lcsLengths[leftIndex + 1]![rightIndex + 1]!;

    if (pairScore >= skipLeft && pairScore >= skipRight) {
      lines.push({
        leftLineNumber: leftIndex + 1,
        rightLineNumber: rightIndex + 1,
        leftText,
        rightText,
        status: "changed",
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    if (skipLeft > skipRight) {
      lines.push({
        leftLineNumber: leftIndex + 1,
        rightLineNumber: null,
        leftText,
        rightText: null,
        status: "removed",
      });
      leftIndex += 1;
      continue;
    }

    if (skipRight > skipLeft) {
      lines.push({
        leftLineNumber: null,
        rightLineNumber: rightIndex + 1,
        leftText: null,
        rightText,
        status: "added",
      });
      rightIndex += 1;
      continue;
    }

    lines.push({
      leftLineNumber: leftIndex + 1,
      rightLineNumber: rightIndex + 1,
      leftText,
      rightText,
      status: "changed",
    });
    leftIndex += 1;
    rightIndex += 1;
  }

  while (leftIndex < leftCount) {
    lines.push({
      leftLineNumber: leftIndex + 1,
      rightLineNumber: null,
      leftText: leftLines[leftIndex]!,
      rightText: null,
      status: "removed",
    });
    leftIndex += 1;
  }

  while (rightIndex < rightCount) {
    lines.push({
      leftLineNumber: null,
      rightLineNumber: rightIndex + 1,
      leftText: null,
      rightText: rightLines[rightIndex]!,
      status: "added",
    });
    rightIndex += 1;
  }

  return lines;
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
  const leftLines = splitBodyLines(left);
  const rightLines = splitBodyLines(right);
  const leftCount = leftLines.length;
  const rightCount = rightLines.length;

  if (leftCount === 0 && rightCount === 0) {
    return [];
  }

  if (leftCount * rightCount > LCS_CELL_LIMIT) {
    return compareBodyLinesWithFallback(leftLines, rightLines);
  }

  return compareBodyLinesWithLcs(leftLines, rightLines);
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
      changed: normalizeBodyText(left.body) !== normalizeBodyText(right.body),
      lines: compareBodyLines(left.body, right.body),
    },
  };
}
