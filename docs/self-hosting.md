# Self-hosting Atlas Todo

An Atlas Todo server is the Atlas sync server (from the core repository,
[atlastodo/atlas](https://github.com/atlastodo/atlas)) serving this app's web build. The server's
settings, reverse proxy, backups, upgrades and admin accounts are covered by core's
[self-hosting guide](https://github.com/atlastodo/atlas/blob/main/docs/self-hosting.md); this page
covers what is specific to Atlas Todo: where the web app comes from.

## Docker

The image `ghcr.io/atlastodo/atlas-todo` is core's server image (`ghcr.io/atlastodo/atlas`) with the
web app added. Each Atlas Todo release publishes it, built on the core release the app pins, as
`X.Y.Z`, `X.Y` and (stable releases) `latest`, for linux/amd64 and linux/arm64. It listens on 8080
and serves the web app at `/` and the API at `/api`.

```sh
git clone https://github.com/atlastodo/atlas-todo.git   # or download compose.yaml and .env.example
cd atlas-todo
cp .env.example .env    # set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d
```

Pin a version in production: `ATLAS_TODO_IMAGE=ghcr.io/atlastodo/atlas-todo:X.Y.Z` in `.env`. Any
other server setting goes in the same `.env` (see core's guide).

Check an image's provenance with
`gh attestation verify oci://ghcr.io/atlastodo/atlas-todo:X.Y.Z --repo atlastodo/atlas-todo`.

### Moving from core's compose

Core's image used to carry the Atlas Todo web app, and its compose file ran it. Core's image is
now the server alone. To keep the web app, run this repository's `compose.yaml` instead:
it has the same project (`atlas-todo`), services and volumes, so the database and the attachments
carry over. Copy your `.env` next to it, replace any `ATLAS_IMAGE` with `ATLAS_TODO_IMAGE` (the
`ghcr.io/atlastodo/atlas-todo` image), then `docker compose up -d` from this directory. A
deployment that uses its own project name keeps using it (`-p <name>`, with `ATLAS_DB_VOLUME`).

The image name `ghcr.io/atlastodo/atlas-todo` is the same one core's image was mirrored under while
the repository was renamed; it now gets this repository's images. The Docker Hub names
(`atlastodo/atlas`, `atlastodo/atlas-todo`) get no new tags.

### Building it yourself

`docker:build` (in `devenv shell`) exports the web app, writes its third-party notices and builds
the image as `atlas-todo:local` on the pinned core image (`ATLAS_IMAGE=ghcr.io/atlastodo/atlas:X`
picks another base). See `docker/Dockerfile`.

## NixOS

Use core's NixOS module (`services.atlas`, from `github:atlastodo/atlas`) and point its `staticDir`
at this flake's web build:

```nix
# flake inputs
inputs.atlas.url = "github:atlastodo/atlas";
inputs.atlas-todo.url = "github:atlastodo/atlas-todo";

# configuration
imports = [ inputs.atlas.nixosModules.atlas ];
services.atlas = {
  enable = true;
  staticDir = inputs.atlas-todo.packages.${pkgs.stdenv.hostPlatform.system}.web-dist;
  # … see core's guide
};
```

`web-dist` is built from this repository's source at the locked commit, with no API URL baked
in: in a browser the app uses the page's origin, where the server answers the API.

## Other servers

Any Atlas server serves the web app when `STATIC_DIR` points at a web build: the
`atlas-todo-web-X.Y.Z.tar.gz` asset of each [release](https://github.com/atlastodo/atlas-todo/releases)
(one top-level directory of static files; it calls the API at `/api` on its own origin), unpacked.
