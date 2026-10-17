// The Cloudflare Vite plugin serialises .dev.vars (or .env, or process
// variables) into dist/<worker>/.dev.vars for `vite preview`. Every build,
// including a direct `vite build`, drops local settings files before they are
// written: local credentials never reach dist/, and so never a deployment.
// rer build and rer deploy also run builds with these files moved aside and
// refuse output that still holds one, naming it.
const localVariables = fileName => /(?:^|\/)(?:\.dev\.vars|\.env)(?:\.[^/]*)?$/.test(fileName);

export function excludeLocalVariables() {
 return {
  name: 'rer:exclude-local-variables',
  apply: 'build',
  enforce: 'post',
  generateBundle: {
   order: 'post',
   handler(_options, bundle) {
    for (const fileName of Object.keys(bundle)) if (localVariables(fileName)) delete bundle[fileName];
   },
  },
 };
}
