import type { ContentDocument, SortField, SortOrder } from "./types.js";

export type ContentGroupedListOptions = {
  matchedRows: ContentDocument[];
  allRows: ContentDocument[];
  sort: SortField;
  order: SortOrder;
  defaultLocale?: string;
  supportedLocales?: string[];
};

type GroupSortKeys = {
  createdAt: string;
  updatedAt: string;
  path: string;
};

type LocalePreference = {
  defaultLocale?: string;
  supportedLocales?: string[];
};

function sortLocales(
  locales: Iterable<string>,
  preference: LocalePreference,
): string[] {
  const supportedRank = new Map(
    (preference.supportedLocales ?? []).map((locale, index) => [locale, index]),
  );

  return [...new Set(locales)].sort((left, right) => {
    const leftRank = supportedRank.get(left);
    const rightRank = supportedRank.get(right);

    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }

    return left.localeCompare(right);
  });
}

function pickRepresentativeDocument(
  rows: ContentDocument[],
  preference: LocalePreference,
): ContentDocument {
  const byLocale = new Map<string, ContentDocument>();

  for (const row of rows) {
    if (!byLocale.has(row.locale)) {
      byLocale.set(row.locale, row);
    }
  }

  const preferredLocales = [
    ...(preference.defaultLocale ? [preference.defaultLocale] : []),
    ...(preference.supportedLocales ?? []),
  ];
  const seen = new Set<string>();

  for (const locale of preferredLocales) {
    if (seen.has(locale)) {
      continue;
    }
    seen.add(locale);
    const preferred = byLocale.get(locale);
    if (preferred) {
      return preferred;
    }
  }

  return [...rows].sort((left, right) => {
    const localeCompared = left.locale.localeCompare(right.locale);
    if (localeCompared !== 0) {
      return localeCompared;
    }
    return left.documentId.localeCompare(right.documentId);
  })[0]!;
}

function toGroupSortKeys(
  rows: ContentDocument[],
  representative: ContentDocument,
): GroupSortKeys {
  return {
    createdAt: [...rows]
      .map((row) => row.createdAt)
      .sort((left, right) => left.localeCompare(right))[0]!,
    updatedAt: [...rows]
      .map((row) => row.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0]!,
    path: representative.path,
  };
}

export function groupDocumentsByTranslationGroup(
  input: ContentGroupedListOptions,
): ContentDocument[] {
  const availableGroupRows = new Map<string, ContentDocument[]>();

  for (const row of input.allRows) {
    if (row.isDeleted) {
      continue;
    }

    const existing = availableGroupRows.get(row.translationGroupId) ?? [];
    existing.push(row);
    availableGroupRows.set(row.translationGroupId, existing);
  }

  const rowsWithSortKeys = [
    ...new Set(input.matchedRows.map((row) => row.translationGroupId)),
  ].map((translationGroupId) => {
    const groupRows =
      availableGroupRows.get(translationGroupId) ??
      input.matchedRows.filter(
        (row) => row.translationGroupId === translationGroupId,
      );
    const representative = pickRepresentativeDocument(groupRows, {
      defaultLocale: input.defaultLocale,
      supportedLocales: input.supportedLocales,
    });
    const latestUpdated = [...groupRows].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )[0]!;
    const publishedVersions = groupRows
      .map((row) => row.publishedVersion)
      .filter((version): version is number => version !== null);

    return {
      row: {
        ...representative,
        publishedVersion:
          publishedVersions.length > 0 ? Math.max(...publishedVersions) : null,
        hasUnpublishedChanges: groupRows.some(
          (row) => row.publishedVersion === null || row.hasUnpublishedChanges,
        ),
        updatedAt: latestUpdated.updatedAt,
        updatedBy: latestUpdated.updatedBy,
        localesPresent: sortLocales(
          groupRows.map((row) => row.locale),
          {
            defaultLocale: input.defaultLocale,
            supportedLocales: input.supportedLocales,
          },
        ),
        publishedLocales: sortLocales(
          groupRows
            .filter((row) => row.publishedVersion !== null)
            .map((row) => row.locale),
          {
            defaultLocale: input.defaultLocale,
            supportedLocales: input.supportedLocales,
          },
        ),
      } satisfies ContentDocument,
      sortKeys: toGroupSortKeys(groupRows, representative),
    };
  });

  rowsWithSortKeys.sort((left, right) => {
    const field =
      input.sort === "createdAt"
        ? "createdAt"
        : input.sort === "path"
          ? "path"
          : "updatedAt";
    const compared = left.sortKeys[field].localeCompare(right.sortKeys[field]);
    return input.order === "asc" ? compared : compared * -1;
  });

  return rowsWithSortKeys.map((entry) => entry.row);
}
