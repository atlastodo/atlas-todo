# The Bun workspace as a source tree: every workspace must be present for
# `bun install --frozen-lockfile` to accept the lockfile.
{ lib }:

let
  root = ../..;
in
lib.fileset.toSource {
  inherit root;
  fileset = lib.fileset.unions [
    (root + "/package.json")
    (root + "/bun.lock")
    (root + "/apps/mobile")
    (root + "/apps/electron")
    (root + "/packages")
    # packages/client-core imports the shared plaintext-field fixture.
    (root + "/test-vectors")
  ];
}
