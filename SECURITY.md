# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue or pull request.

- In the app (Android, iOS, web, desktop, the local store, the key storage on a device):
  [open a private advisory here](https://github.com/atlastodo/atlas-todo/security/advisories/new).
- In the server, the container image, the core client packages (the encryption, the sync client)
  or the `atlas` CLI:
  [open a private advisory in the core repository](https://github.com/atlastodo/atlas/security/advisories/new).

Not sure which? Use either: the same maintainer reads both and moves the report where it belongs.

Include a description, the affected version or commit, and steps or a proof of concept. Once a fix
is released, you are credited in the release notes and the advisory if you want to be.

### What happens next

Atlas Todo has one maintainer, who reads every report.

- **Within 7 days:** an acknowledgement in the advisory.
- **Within 14 days:** an assessment: whether it is a vulnerability, how severe (CVSS), and a plan.
- **The fix** ships in a patch release (a new APK, desktop tarball and web build here, or a new
  server image in the core repository). The advisory is then published on GitHub, with a CVE
  requested through GitHub when it applies, and linked from the release notes.
- **Disclosure:** please keep the details private until the fix is released, or for 90 days from
  your report, whichever comes first. If a fix needs longer, we agree on a date in the advisory.

## Supported versions

Atlas Todo is pre-1.0. Only the latest release gets security fixes. Please check that the
problem exists in the latest release (or on `main`) before you report it.

The design and the code have not had an independent security audit.

## Verifying a release

Release files (APK, AAB, desktop tarball, web app tarball) carry GitHub build provenance
attestations, which show they were built by this repository's release workflow from the tagged
commit:

```sh
gh attestation verify atlas-todo-X.Y.Z.apk --repo atlastodo/atlas-todo
```

Each release also lists `SHA256SUMS.txt`, which the desktop app checks before it installs an
update. Releases up to 0.1.11-rc.5 were made in the core repository (then named
`atlastodo/atlas-todo`, now `atlastodo/atlas`); verify those with `--repo atlastodo/atlas`.
Releases before 0.1.10 have no attestations. The server image is verified against the core
repository, as its SECURITY.md shows.

## Scope

- The apps: `apps/mobile` (Android, iOS and the web app) and `apps/electron` (the desktop shell),
  their local stores, their key storage and how they use the core packages.
- The release artifacts built here.

The threat model (what the server can and cannot see, the plaintext fields, the recovery phrase,
key distribution, API tokens, the account root key and passkeys) is shared by every Atlas client
and lives in the core repository's
[SECURITY.md](https://github.com/atlastodo/atlas/blob/main/SECURITY.md), with how the cryptography
works in its [architecture notes](https://github.com/atlastodo/atlas/blob/main/docs/architecture.md#end-to-end-encryption).

## Known limitations of the apps

- The web app is served by the server. Whoever controls the server controls the JavaScript the
  browser runs and could steal keys from web users. The Android and desktop apps bundle their
  own code.
- Android builds with Expo Updates enabled fetch JavaScript updates from the Expo project named
  by `ATLAS_EAS_PROJECT_ID`. Builds made with `ATLAS_EAS_PROJECT_ID=none` never do.
- The app does not encrypt data on your devices. Each client keeps synced data unencrypted in its
  local database (SQLite on Android and iOS, IndexedDB in the browser and desktop app) and
  relies on the app sandbox and device encryption. Signing out deletes the database, after
  warning about unsynced changes, and deleting the account always does. The Android app opts out
  of Android backup, so that database is never copied to a cloud or adb backup.
- In the browser, session tokens are in `localStorage` and the unlocked keys are wrapped under a
  non-extractable WebCrypto key in IndexedDB. A copy of the profile yields the keys, and an XSS
  bug can unwrap them while the page is open. The desktop app wraps the keys with the OS key
  store through Electron's `safeStorage`, so a copy of the profile alone does not open them, but
  other programs running as you may. On Linux without a keyring it falls back to the browser's
  wrap. See [the architecture notes](https://github.com/atlastodo/atlas/blob/main/docs/architecture.md#key-storage-on-the-client).
- The recovery phrase on the clipboard is marked sensitive on Android and cleared after a
  minute, but clipboard managers, iOS Universal Clipboard and keyboards that ignore the flag may
  keep a copy. Writing the phrase down is safer.
- The desktop app, unless it runs from the Nix store, checks this repository's GitHub Releases
  once a day and installs an update only after its SHA-256 matches the release's
  `SHA256SUMS.txt` (`--no-update` or `ATLAS_DISABLE_UPDATE=1` turns the check off).
