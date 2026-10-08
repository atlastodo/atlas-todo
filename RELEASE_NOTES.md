## v0.1.8

### Features
- Sign in and create account as steps of the welcome wizard
- Select mode on the board
- Bulk actions in the task context menu
- Click outside the tasks to leave select mode
- One current-value style in the task context menu
- Hover highlight on project rows
- One package-manager message for disabled desktop updates
- A Desktop app section in Settings
- Close to the tray by default
- Keep the desktop layout in a narrow desktop window
- Create projects in a dialog with icon, colour, folder and view

### Fixes
- Localize relative times in Devices
- Lock scrolling while a sheet is being pulled
- A dedicated Android notification icon
- Theme the task context menu's portal
- Launch Electron without devenv's LD_LIBRARY_PATH
- Drop the chevron on project rows

### Changes
- Point Dependabot at dev and regenerate nix/bun.nix on its PRs
- Keep the Rust cache key stable, and save Rust caches from dev
- Optimize the Argon2 crates in dev and test builds
