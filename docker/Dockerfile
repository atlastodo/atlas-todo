# The Atlas Todo server image: the core server image (ghcr.io/atlastodo/atlas, the sync server
# alone) with this app's web build added, so one container serves the API and the web app.
#
# Nothing is compiled here. The build context is a directory holding exactly one web release
# tarball, atlas-todo-web-X.Y.Z.tar.gz (scripts/web-release-tarball.sh), and the release's
# THIRD_PARTY_NOTICES.txt (scripts/third-party-licenses.mjs). release.yml builds it from the
# release's own files; locally, `docker:build` stages them and builds.
#
# The base is the core release this app pins (the same version as the @atlastodo/* packages and the
# atlas-client tag in Cargo.toml; deps:update moves them together). ATLAS_IMAGE overrides it:
#   docker build -f docker/Dockerfile --build-arg ATLAS_IMAGE=ghcr.io/atlastodo/atlas:dev <context>
ARG ATLAS_IMAGE=ghcr.io/atlastodo/atlas:0.1.16

# The tarball, unpacked by ADD (no RUN, so no emulation for other architectures). It holds one
# directory, atlas-todo-web-X.Y.Z/, whose contents are the static files.
FROM scratch AS web
ADD atlas-todo-web-*.tar.gz /web/

# Its own directories, not the base's /app/dist and /usr/share/doc/atlas*: older core images carried
# a web build of their own there, and a COPY would only merge into it.
FROM ${ATLAS_IMAGE}
COPY --from=web /web/atlas-todo-web-*/ /app/web/
COPY THIRD_PARTY_NOTICES.txt /usr/share/doc/atlas-todo-web/
ENV STATIC_DIR=/app/web
