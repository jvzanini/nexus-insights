declare module "pg-format" {
  function format(fmt: string, ...args: any[]): string;
  export default format;
}
