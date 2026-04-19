export interface CodeBlockLanguageEntry {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
}

export const PLAIN_TEXT_LANGUAGE_VALUE = "__plain_text__" as const;

export const COMMON_CODE_BLOCK_LANGUAGES: readonly CodeBlockLanguageEntry[] = [
  { id: "bash", label: "Bash", aliases: ["sh", "shell", "zsh"] },
  { id: "c", label: "C", aliases: [] },
  { id: "cpp", label: "C++", aliases: ["c++", "cc"] },
  { id: "csharp", label: "C#", aliases: ["cs"] },
  { id: "css", label: "CSS", aliases: [] },
  { id: "diff", label: "Diff", aliases: ["patch"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "graphql", label: "GraphQL", aliases: ["gql"] },
  { id: "ini", label: "INI / TOML", aliases: ["toml"] },
  { id: "java", label: "Java", aliases: [] },
  { id: "javascript", label: "JavaScript", aliases: ["js", "jsx"] },
  { id: "json", label: "JSON", aliases: [] },
  { id: "kotlin", label: "Kotlin", aliases: ["kt"] },
  { id: "less", label: "Less", aliases: [] },
  { id: "lua", label: "Lua", aliases: [] },
  { id: "makefile", label: "Makefile", aliases: ["make", "mk"] },
  { id: "markdown", label: "Markdown", aliases: ["md", "mdx"] },
  { id: "objectivec", label: "Objective-C", aliases: ["objc"] },
  { id: "perl", label: "Perl", aliases: ["pl"] },
  { id: "php", label: "PHP", aliases: [] },
  { id: "plaintext", label: "Plain text (tagged)", aliases: ["text", "txt"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "r", label: "R", aliases: [] },
  { id: "ruby", label: "Ruby", aliases: ["rb"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "scss", label: "SCSS", aliases: ["sass"] },
  { id: "sql", label: "SQL", aliases: [] },
  { id: "swift", label: "Swift", aliases: [] },
  { id: "typescript", label: "TypeScript", aliases: ["ts", "tsx"] },
  { id: "xml", label: "HTML / XML", aliases: ["html", "svg"] },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
];

function buildLanguageLookup(): ReadonlyMap<string, CodeBlockLanguageEntry> {
  const map = new Map<string, CodeBlockLanguageEntry>();

  for (const entry of COMMON_CODE_BLOCK_LANGUAGES) {
    map.set(entry.id, entry);
    for (const alias of entry.aliases) {
      map.set(alias, entry);
    }
  }

  return map;
}

const LANGUAGE_LOOKUP = buildLanguageLookup();

export function getCodeBlockLanguageLabel(
  attrValue: string | null | undefined,
): string {
  // An absent attribute means the fence had no info string (` ``` `) —
  // display "Plain text". A literal `plaintext` info string is deliberately
  // labeled differently ("Plain text (tagged)") so authors can distinguish
  // an untagged fence from one they explicitly tagged as plaintext.
  if (!attrValue) {
    return "Plain text";
  }

  const match = LANGUAGE_LOOKUP.get(attrValue);
  if (match) {
    return match.label;
  }

  return attrValue;
}

export function isKnownCodeBlockLanguage(attrValue: string): boolean {
  return LANGUAGE_LOOKUP.has(attrValue);
}

export interface CodeBlockLanguageAttrPatch {
  readonly language: string | null;
}

export function resolveCodeBlockLanguageChange(
  nextDropdownValue: string,
): CodeBlockLanguageAttrPatch {
  if (nextDropdownValue === PLAIN_TEXT_LANGUAGE_VALUE) {
    return { language: null };
  }

  return { language: nextDropdownValue };
}
