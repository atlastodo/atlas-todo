/**
 * Metro (via NativeWind) handles `import "./global.css"`, but TypeScript needs to be told the
 * side-effect import resolves to something. `nativewind/types` does not declare it.
 */
declare module "*.css";
