# The Electron the desktop app runs on: nixpkgs' `electron`, unless it is older than the release
# pinned here, which carries a security fix nixpkgs has not packaged yet (GHSA-jr5w-w6x2-84p9, the
# compromised eMudhra intermediate certificates: fixed in 43.8.1). Then the official release binary
# of the pinned version, built with nixpkgs' own electron-bin builder. Used by
# nix/packages/atlas-desktop.nix and, copied next to it, by the release tarball's flake.
#
# Drop this file (and use `electron` again) once nixpkgs' electron is at least the pinned version.
# Hashes: SHASUMS256.txt of the GitHub release; headers: `nix-prefetch-url --unpack` of
# https://artifacts.electronjs.org/headers/dist/v<version>/node-v<version>-headers.tar.gz.
{
  lib,
  callPackage,
  electron,
  path,
}:

let
  version = "43.8.3";
  hashes = {
    x86_64-linux = "73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22";
    aarch64-linux = "b814ab22abf0bce90fd2fffc1490efc94f388353bcdb2f744950744998fd97b1";
    headers = "1k3idywwl7fxqjxx7i8r5la1h6v4fvmxs4lvfwipxx59vjnmncki";
  };
in
if lib.versionAtLeast electron.version version then
  electron
else
  callPackage (path + "/pkgs/development/tools/electron/binary/generic.nix") { } version hashes
