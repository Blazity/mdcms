import { input, select, checkbox, confirm } from "@inquirer/prompts";
import ora from "ora";

function isExitPromptError(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

export type PromptChoice<T extends string = string> = {
  label: string;
  value: T;
};

export type Prompter = {
  intro(message: string): void;
  outro(message: string): void;
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
  spinner(): { start(msg: string): void; stop(msg: string): void };
};

export function createInquirerPrompter(): Prompter {
  return {
    intro(message) {
      console.log(`\n  ${message}\n`);
    },
    outro(message) {
      console.log(`\n  ${message}\n`);
    },
    async text(message, defaultValue) {
      try {
        return await input({ message, default: defaultValue });
      } catch (error) {
        if (isExitPromptError(error)) process.exit(0);
        throw error;
      }
    },
    async select<T extends string>(
      message: string,
      choices: PromptChoice<T>[],
    ): Promise<T> {
      try {
        return await select({
          message,
          choices: choices.map((c) => ({
            name: c.label,
            value: c.value,
          })),
        });
      } catch (error) {
        if (isExitPromptError(error)) process.exit(0);
        throw error;
      }
    },
    async multiSelect<T extends string>(
      message: string,
      choices: PromptChoice<T>[],
    ): Promise<T[]> {
      try {
        return await checkbox({
          message,
          choices: choices.map((c) => ({
            name: c.label,
            value: c.value,
          })),
        });
      } catch (error) {
        if (isExitPromptError(error)) process.exit(0);
        throw error;
      }
    },
    async confirm(message) {
      try {
        return await confirm({ message });
      } catch (error) {
        if (isExitPromptError(error)) process.exit(0);
        throw error;
      }
    },
    spinner() {
      const s = ora();
      return {
        start(msg: string) {
          s.start(msg);
        },
        stop(msg: string) {
          s.succeed(msg);
        },
      };
    },
  };
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
    intro() {},
    outro() {},

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

    spinner() {
      return {
        start() {},
        stop() {},
      };
    },
  };

  return prompter;
}
