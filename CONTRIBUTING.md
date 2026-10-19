# Contributing to Atlas Todo

Thanks for your interest. This repository is the Atlas Todo app: one React Native + Expo UI for
Android, iOS and the web (`apps/mobile`) and the Electron desktop shell (`apps/electron`). The
sync server, the core client packages (`@atlastodo/client-core`, `@atlastodo/shared`) and their
docs are in the core repository, [atlastodo/atlas](https://github.com/atlastodo/atlas), which has
its own contributing guide. For a map of how the pieces fit, start with its
[architecture notes](https://github.com/atlastodo/atlas/blob/main/docs/architecture.md).

**Open pull requests against the `dev` branch**, not `main` (GitHub's default): `main` only
receives releases. See [Branches and releases](#branches-and-releases).

For anything larger than a small fix, open an issue first so we can agree on the approach before
you write code; a draft pull request early on is welcome too. A feature PR without an agreed
issue may be closed with a pointer here. Questions and ideas that are not bugs go to
[Discussions](https://github.com/atlastodo/atlas-todo/discussions). Everyone taking part follows
the [Code of Conduct](./CODE_OF_CONDUCT.md).

The project has one maintainer, who decides what is merged. Issues and pull requests are triaged
about once a week; if your pull request has had no response after 7 days, comment on it to ping.
[.github/SUPPORT.md](./.github/SUPPORT.md) has the rest of what to expect.

## Scope

The [roadmap](https://github.com/atlastodo/atlas/blob/main/ROADMAP.md) says where the project is
going. Some things are out of scope for good, so please don't start on them without asking:

- Anything that needs the server to read task content (server-side search, a server CalDAV
  endpoint): see the core repository's
  [decisions 0002 and 0003](https://github.com/atlastodo/atlas/tree/main/docs/decisions).
- A separate native UI for one platform: see
  [decision 0005](https://github.com/atlastodo/atlas/blob/main/docs/decisions/0005-one-react-native-ui.md).
- Telemetry or analytics of any kind.

A change that needs the core packages or the server to change too starts in the core repository;
the app picks it up with the next core release (see [Core packages](#core-packages)).

## Good first contributions

- Issues labelled [`good first issue`](https://github.com/atlastodo/atlas-todo/labels/good%20first%20issue)
  are small and self-contained; [`help wanted`](https://github.com/atlastodo/atlas-todo/labels/help%20wanted)
  ones are bigger.
- Translations: the catalogs live in `@atlastodo/shared`, in the core repository
  (`packages/shared/src/locales/`); its contributing guide has the steps.
- Not code: testing a pre-release (the Android closed test, an `-rc` APK or desktop tarball),
  reproducing someone else's bug report, or answering a question in Discussions all help.
- Accessibility: [ACCESSIBILITY.md](./ACCESSIBILITY.md) lists the known gaps.

## Development environment

The environment is defined with [devenv](https://devenv.sh) (Nix). It pins Node 26, Bun 1.4.2
and Electron, and the Android SDK when you turn it on.

```sh
git clone https://github.com/<you>/atlas-todo.git
cd atlas-todo
git remote add upstream https://github.com/atlastodo/atlas-todo.git
git fetch upstream
git switch -c my-change upstream/dev   # branch from dev: PRs target it
devenv shell           # enter the environment
bun install
web:dev                # the web app with live reload
```

The app needs an Atlas server to sign in to. `web:dev`, `desktop:dev` and `mobile:android` point
it at `EXPO_PUBLIC_API_URL`, `http://localhost:8080` by default: run a server from the core
repository there (its `devenv up`, then `cargo run -p atlas-server`, or its Docker image), or
export `EXPO_PUBLIC_API_URL` with another server before running them. The sign-in screen also
has a _Server URL_ field.

### Without Nix

devenv is the supported setup, but nothing requires it. You need Node 26 and Bun 1.4.2.

```sh
bun install
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:8080 bun run web
```

The devenv scripts are short shell in `devenv.nix`. Without devenv, `test:all` and `lint` are:

```sh
# test:all
(cd apps/electron && bunx --bun vitest run)
(cd apps/mobile && bun run test)

# lint
bun run --parallel --filter '*' typecheck
bunx oxlint .
bunx prettier --check .
node scripts/third-party-licenses.mjs --check
```

If you change dependencies without Nix, `nix/bun.nix` can't be regenerated (`nix:bun-lock`). Say
so in the pull request and the maintainer will regenerate it.

### Android SDK (optional)

The Android SDK is several GB, so it is off by default. Expo Go (`mobile:dev`) and the EAS cloud
builds don't need it. To turn it on for your machine, create a `devenv.local.nix` in the
repository root (it is gitignored):

```nix
{ android.enable = true; }
```

Then leave and re-enter `devenv shell`. The scripts that need the SDK tell you this when it is
off.

## Scripts

All of these run inside `devenv shell` (without it, see [Without Nix](#without-nix)). The root
`package.json` has no scripts.

| Script                             | What it does                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `web:dev`                          | the Expo web dev server against `EXPO_PUBLIC_API_URL`                      |
| `mobile:dev`                       | Metro for a phone running Expo Go                                          |
| `desktop:dev`                      | the web dev server and the Electron app with live reload                   |
| `desktop:start`                    | export the web bundle and run Electron against it                          |
| `desktop:package`                  | build the desktop tarball                                                  |
| `web:release-tarball`              | build the release's web app tarball                                        |
| `nix:bun-lock`                     | regenerate `nix/bun.nix` after a `bun.lock` change                         |
| `test:all`                         | every test suite (see below)                                               |
| `lint`                             | typecheck, oxlint, Prettier check, licences, `nix/bun.nix` freshness       |
| `fmt`                              | prettier                                                                   |
| `screenshots`                      | regenerate `docs/screenshots` (needs Docker: a throwaway server and DB)    |
| `emulator:start`, `mobile:android` | Android emulator and native dev build (needs the SDK)                      |
| `build:android:*`                  | Android builds through EAS, locally or in the cloud                        |
| `android:permissions`              | the last release build's permissions against `docs/android-permissions.md` |
| `version:bump`                     | release helper, maintainers only                                           |

The full-suite script is `test:all`, not `test`: a script named `test` collides with the shell
builtin.

## Tests

`test:all` runs, in order and stopping at the first failure:

1. vitest in `apps/electron`
2. jest (jest-expo) in `apps/mobile`

`lint` typechecks `apps/mobile` and `apps/electron` and runs `oxlint .`, `prettier --check .`, the
licence check and the `nix/bun.nix` freshness check. `fmt` fixes the formatting.

To run one test:

- `apps/electron`: `cd apps/electron && bunx --bun vitest run src/foo.test.ts`
- `apps/mobile`: `bun run test -- <pattern>`. This must run under Node, not Bun's runtime, or it
  fails at load with `Attempted to assign to readonly property`.

Tests live next to the code they test: `apps/electron/src/*.test.ts` and
`apps/mobile/src/**/*.test.tsx`. Some mobile tests assert the fixtures the core packages ship
(`@atlastodo/client-core/test-vectors/*`), so the app's crypto agrees with the core's.

## Core packages

`apps/mobile` depends on `@atlastodo/client-core` and `@atlastodo/shared` from npm, pinned to one
exact core release version in `apps/mobile/package.json`. Moving to a new core release is a change
of those two versions (keep them on one version), then `bun install`, `nix:bun-lock`, `test:all`
and a web export. See [apps/mobile/RELEASE.md](./apps/mobile/RELEASE.md#pinning-the-core-packages).

## Adding or changing UI text

All user-facing text goes through i18next, and the catalogs are part of `@atlastodo/shared`, in
the core repository. Add the keys there first (its contributing guide says how); once a core
release carries them, bump the pin here and use them with `t("section.key")`.
`cd apps/mobile && bun run test -- i18n/keys` checks that every literal key the app uses exists in
every locale.

## Commits and pull requests

- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat:`, `fix(mobile):`, `refactor(desktop):`, `docs:`, … Release notes are generated from the
  commit log, so write the subject for users. The notes of each release also thank its
  contributors by name.
- Keep a PR to one change. Explain what and why, and how you tested it (platforms, screenshots
  for UI changes). The PR template has a short checklist.
- Run `lint` and `test:all` before you open the PR. CI runs the same checks.
- Add tests for new behaviour.
- Don't edit a version number. Versions move in lockstep across all manifests and only change
  in release commits.
- Don't commit secrets, keystores, `.env` files or build output (`dist-desktop/`,
  `atlas-desktop-*.tar.gz`).
- Security problems go through [SECURITY.md](./SECURITY.md), not a public issue or PR.

### Branches and releases

Work lands on the long-lived `dev` branch; open pull requests against `dev`. `main` holds stable
releases only. As a contributor that is all you need: target `dev` and follow Conventional
Commits; the rest of this section is what the maintainer does. The maintainer tags pre-releases
(`v0.1.12-rc.1`) on `dev`, and when one is good, merges `dev` into `main` through a pull request
(`main` takes no direct pushes) and tags the stable `v0.1.12`. Pre-releases go to GitHub as
prereleases and to the Play internal track. Details in
[apps/mobile/RELEASE.md](./apps/mobile/RELEASE.md).

### What CI runs

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `dev` and
`main`, for the jobs whose files changed; a tag runs the full suite. Pull requests from forks need
no secrets, so they get the same checks:

| Check             | What it runs                                                       |
| ----------------- | ------------------------------------------------------------------ |
| Lint (TypeScript) | typecheck of mobile and electron; oxlint; Prettier check; licences |
| Test (TypeScript) | vitest in apps/electron                                            |
| Test (mobile)     | jest in apps/mobile                                                |
| Audit (JS)        | `bun audit` (allowed to fail)                                      |

The audit is informational, so a red audit check on a pull request does not block it. A known,
unfixable advisory is explained under `//audit-known` in the root `package.json`. Fixable
advisories are fixed with `overrides`, not ignored.

## Bug reports from the app

The app's _Report a problem_ screen sends a report to the server it is connected to. It shows up
in that server's admin panel, not in this repository. To report a bug in Atlas Todo itself, open
a GitHub issue.

## License

By contributing you agree that your contributions are licensed under the repository's
[AGPL-3.0-only](./LICENSE) license.
