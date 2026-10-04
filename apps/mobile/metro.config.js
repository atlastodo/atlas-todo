/**
 * Metro config for the Bun-workspace monorepo.
 *
 * `@atlas/client-core` is consumed from its TypeScript source, so Metro must watch the workspace
 * root, resolve packages from both the app's and the root's `node_modules`, and honour the package
 * `exports` field.
 *
 * Hierarchical lookup must stay enabled: Bun's isolated linker puts each package's dependencies
 * under `node_modules/.bun/<pkg>/node_modules`, so Metro has to walk up from a module's real path
 * to find them. Disabling it, the usual advice for hoisted monorepos, breaks the bundle.
 */

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// No `config.server.unstable_serverRoot` override on purpose: this SDK's manifest points at the real
// `.bun` store path, which exists relative to the workspace root. Pinning the server root to the
// app dir would break `expo export`. Re-check if the SDK is bumped.

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: "./global.css" });
