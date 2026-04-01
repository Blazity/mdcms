declare module "bun:test" {
  export const test: {
    (name: string, fn?: (...args: any[]) => any): any;
    skip: (name: string, fn?: (...args: any[]) => any) => any;
    only: (name: string, fn?: (...args: any[]) => any) => any;
    todo: (name: string, fn?: (...args: any[]) => any) => any;
  };
}
