import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export type PromptChoice<T extends string = string> = {
  label: string;
  value: T;
};

export type Prompter = {
  text(message: string, defaultValue?: string): Promise<string>;
  select<T extends string>(
    message: string,
    choices: PromptChoice<T>[],
  ): Promise<T>;
  multiSelect<T extends string>(
    message: string,
    choices: PromptChoice<T>[],
  ): Promise<T[]>;
  confirm(message: string): Promise<boolean>;
};

export function createReadlinePrompter(): Prompter {
  const rl = createInterface({ input: stdin, output: stdout });

  const prompter: Prompter = {
    async text(message, defaultValue) {
      const suffix = defaultValue !== undefined ? ` (${defaultValue})` : "";
      const answer = await rl.question(`${message}${suffix}: `);
      const trimmed = answer.trim();
      if (trimmed === "" && defaultValue !== undefined) return defaultValue;
      return trimmed;
    },

    async select<T extends string>(
      message: string,
      choices: PromptChoice<T>[],
    ): Promise<T> {
      stdout.write(`${message}\n`);
      for (let i = 0; i < choices.length; i++) {
        stdout.write(`  ${i + 1}) ${choices[i]!.label}\n`);
      }
      const answer = await rl.question("Choose a number: ");
      const index = parseInt(answer.trim(), 10) - 1;
      if (isNaN(index) || index < 0 || index >= choices.length) {
        throw new Error(`Invalid selection: ${answer.trim()}`);
      }
      return choices[index]!.value;
    },

    async multiSelect<T extends string>(
      message: string,
      choices: PromptChoice<T>[],
    ): Promise<T[]> {
      stdout.write(`${message}\n`);
      for (let i = 0; i < choices.length; i++) {
        stdout.write(`  ${i + 1}) ${choices[i]!.label}\n`);
      }
      const answer = await rl.question(
        "Choose numbers (comma-separated): ",
      );
      const indices = answer
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1);
      const selected: T[] = [];
      for (const idx of indices) {
        if (isNaN(idx) || idx < 0 || idx >= choices.length) {
          throw new Error(`Invalid selection: ${idx + 1}`);
        }
        selected.push(choices[idx]!.value);
      }
      return selected;
    },

    async confirm(message) {
      const answer = await rl.question(`${message} (y/N): `);
      return answer.trim().toLowerCase() === "y";
    },
  };

  return prompter;
}

export type MockPrompterQueues = {
  text?: string[];
  select?: string[];
  multiSelect?: string[][];
  confirm?: boolean[];
};

export function createMockPrompter(canned: MockPrompterQueues): Prompter {
  const queues = {
    text: canned.text ? [...canned.text] : [],
    select: canned.select ? [...canned.select] : [],
    multiSelect: canned.multiSelect
      ? canned.multiSelect.map((a) => [...a])
      : [],
    confirm: canned.confirm ? [...canned.confirm] : [],
  };

  const prompter: Prompter = {
    async text(_message, _defaultValue) {
      if (queues.text.length === 0) {
        throw new Error("No more canned text responses");
      }
      return queues.text.shift()!;
    },

    async select<T extends string>(
      _message: string,
      _choices: PromptChoice<T>[],
    ): Promise<T> {
      if (queues.select.length === 0) {
        throw new Error("No more canned select responses");
      }
      return queues.select.shift()! as T;
    },

    async multiSelect<T extends string>(
      _message: string,
      _choices: PromptChoice<T>[],
    ): Promise<T[]> {
      if (queues.multiSelect.length === 0) {
        throw new Error("No more canned multiSelect responses");
      }
      return queues.multiSelect.shift()! as T[];
    },

    async confirm(_message) {
      if (queues.confirm.length === 0) {
        throw new Error("No more canned confirm responses");
      }
      return queues.confirm.shift()!;
    },
  };

  return prompter;
}
