declare module 'opencc-js' {
  export function Converter(config: { from: string; to: string }): (text: string) => string;
}
