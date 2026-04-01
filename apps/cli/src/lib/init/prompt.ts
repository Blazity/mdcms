import * as clack from "@clack/prompts";

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

export function createClackPrompter(): Prompter {
  return {
    intro(message) {
      clack.intro(message);
    },
    outro(message) {
      clack.outro(message);
    },
    async text(message, defaultValue) {
      const result = await clack.text({
        message,
        defaultValue,
        placeholder: defaultValue,
      });
      if (clack.isCancel(result)) process.exit(0);
      return result as string;
    },
    async select<T extends string>(
      message: string,
      choices: PromptChoice<T>[],
    ): Promise<T> {
      const result = await clack.select({
        message,
        options: choices.map((c) => ({
          label: c.label,
          value: c.value as string,
        })),
      });
      if (clack.isCancel(result)) process.exit(0);
      return result as T;
    },
    async multiSelect<T extends string>(
      message: string,
      choices: PromptChoice<T>[],
    ): Promise<T[]> {
      const result = await clack.multiselect({
        message,
        options: choices.map((c) => ({
          label: c.label,
          value: c.value as string,
        })),
        required: false,
      });
      if (clack.isCancel(result)) process.exit(0);
      return result as T[];
    },
    async confirm(message) {
      const result = await clack.confirm({ message });
      if (clack.isCancel(result)) process.exit(0);
      return result as boolean;
    },
    spinner() {
      const s = clack.spinner();
      return {
        start(msg: string) {
          s.start(msg);
        },
        stop(msg: string) {
          s.stop(msg);
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
