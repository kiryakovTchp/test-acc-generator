declare module 'mailparser' {
  export function simpleParser(source: string): Promise<{ text?: string | null; html?: string | false | null }>;
}
