declare module "bun:test" {
  export const test: {
    (name: string, fn?: (...args: unknown[]) => unknown): unknown;
    skip: (name: string, fn?: (...args: unknown[]) => unknown) => unknown;
    only: (name: string, fn?: (...args: unknown[]) => unknown) => unknown;
    todo: (name: string, fn?: (...args: unknown[]) => unknown) => unknown;
  };

  export const describe: (name: string, fn: () => void | Promise<void>) => void;
}
