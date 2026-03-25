import type { MdxExtractedProps } from "../contracts/extensibility.js";

export type MdxAutoFormField =
  | { name: string; control: "text"; required: boolean }
  | { name: string; control: "url"; required: boolean }
  | { name: string; control: "number"; required: boolean }
  | { name: string; control: "boolean"; required: boolean }
  | { name: string; control: "select"; required: boolean; options: string[] }
  | { name: string; control: "string-list"; required: boolean }
  | { name: string; control: "number-list"; required: boolean }
  | { name: string; control: "date"; required: boolean }
  | { name: string; control: "rich-text"; required: boolean };

export function createMdxAutoFormFields(
  extractedProps: MdxExtractedProps | undefined,
): MdxAutoFormField[] {
  if (!extractedProps) {
    return [];
  }

  const fields: MdxAutoFormField[] = [];

  for (const [name, prop] of Object.entries(extractedProps)) {
    switch (prop.type) {
      case "string":
        fields.push({
          name,
          control: prop.format === "url" ? "url" : "text",
          required: prop.required,
        });
        break;
      case "number":
        fields.push({ name, control: "number", required: prop.required });
        break;
      case "boolean":
        fields.push({ name, control: "boolean", required: prop.required });
        break;
      case "enum":
        fields.push({
          name,
          control: "select",
          required: prop.required,
          options: [...prop.values],
        });
        break;
      case "array":
        fields.push({
          name,
          control: prop.items === "number" ? "number-list" : "string-list",
          required: prop.required,
        });
        break;
      case "date":
        fields.push({ name, control: "date", required: prop.required });
        break;
      case "rich-text":
        fields.push({ name, control: "rich-text", required: prop.required });
        break;
      case "json":
        break;
    }
  }

  return fields;
}
