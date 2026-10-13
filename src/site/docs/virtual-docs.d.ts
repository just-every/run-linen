// The module src/site/docs/build/plugin.ts generates from docs/site.json and docs/*.md.
declare module 'virtual:linen-docs' {
  export const sections: import('./types').DocsSection[];
  export const bodies: Record<string, import('./types').DocsBody>;
}
