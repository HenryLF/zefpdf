// Bun bundles CSS imported from TS; TypeScript needs to be told these exist.
// `*.module.css` is matched ahead of the bare `*.css` pattern, so a module
// import is typed as its class-name map rather than as nothing.
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css";
