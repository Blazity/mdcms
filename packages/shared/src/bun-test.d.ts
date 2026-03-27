declare module "bun:test" {
  export function test(label: string, fn: () => void | Promise<void>): void;

  export function test(
    label: string,
    options: { timeout?: number },
    fn: () => void | Promise<void>,
  ): void;
}
