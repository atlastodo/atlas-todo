# atlas-todo-gpui (experiment)

A native desktop app for Atlas Todo on [GPUI](https://www.gpui.rs), Zed's GPU-accelerated UI
framework, to compare against the Electron shell (`apps/electron`, the web export in a window). It is
an experiment: not built by `test:all`, `lint` or CI, not packaged and not released.

## Run it

```sh
devenv shell gpui:dev                       # sign-in screen: server, email, password
devenv shell gpui:dev -- --view board:"Website relaunch" --dark
devenv shell gpui:dev -- --server https://app.atlastodo.dev --token atlas_pat_…   # with an API token
```

It signs in with your **email and password** through core's `Session::login`: only the auth hash
the password derives leaves the machine. The session (its refresh token and the opened keys) is
kept in the system's secret store (Secret Service: GNOME Keyring, KWallet), so the next start
resumes without the password; the server and email of the last sign-in are in
`$XDG_CONFIG_HOME/atlas-todo-gpui/sign-in.json`. It shows in the account's sessions as "Atlas Todo
desktop (GPUI) on <host>". Sign out is at the bottom of the sidebar. `--token` / `ATLAS_TOKEN` sign
in with an API token instead (the screenshots use that). The synced account is cached in
`$XDG_STATE_HOME/atlas-todo-gpui`.

At start it installs `~/.local/share/applications/dev.atlastodo.gpui.desktop` and its icon (the
window's app id is `dev.atlastodo.gpui`), so panels and launchers show the Atlas icon. Where the
session has a tray host (StatusNotifierItem: KDE, waybar, …) it adds a tray icon that opens the
window and quits; closing the window then leaves the app in the tray.

`--view` is `today`, `upcoming`, `inbox`, `assigned`, `all`, `completed`, `projects`, `calendar`,
`habits`, `stats`, … or `project:NAME` / `board:NAME`; `--task TITLE` opens a task's dialog.

`devenv shell gpui:screenshot OUT.png --server … --token … [--view …] [--task …] [--dark]` renders one
screen offscreen through GPUI's headless wgpu renderer (the `screenshots` feature) at the README
shots' size, 1280×800 at 2×. `ATLAS_GPUI_TOUR=1` walks through the screens and their transitions on
a timer (it completes a task and checks in a habit, then puts both back: use a throwaway account).

## Comparing with the web app

`docs/gpui/` holds the comparisons in the PR that added this crate: each README desktop shot next to
the same screen in GPUI, on the same account. The account was seeded by `scripts/screenshots.mjs`
against a server kept running, with `TOKEN_FILE=…` so the script also creates an API token (Settings
→ API tokens) and writes it there; each GPUI screen was then rendered with `gpui:screenshot` against
that server and token.

## How it is built

- **Data**: `atlas-todo-rules`' `TodoClient` (core's `atlas-client`) on a worker thread: sign-in,
  pull and decrypt, then a sync every 5 s. The UI gets a plain `Snapshot` of the account after each
  change and sends commands back (complete/reopen, quick add, priority, habit check-ins), applied
  optimistically. Tasks go through the shared todo rules (recurrence, quick add, …); sections,
  habits, focus sessions, reminders and comments are read from the fields the mobile app writes.
- **Screens**: sidebar, Today, Upcoming, Inbox, Assigned, All tasks, Completed, Projects, a project's
  list and board, Calendar (month and week, agenda), Habits, Stats and the task dialog. Filters,
  Notifications, Focus and Countdowns are placeholders.
- **Look**: Tailwind's neutral scale and the indigo accent (`theme.rs`), the app's Lucide icons
  (`assets/icons`, from the `lucide-react-native` the mobile app ships: `scripts/icons.mjs`) and
  Noto Sans, the font Chromium renders the web app in on Linux, as static weights (`assets/fonts`,
  `scripts/fonts.py`: GPUI's Linux text system does not apply a variable font's weight axis).
  GPUI draws the same font about 14% larger than Chromium at the same pixel size, so `ui::ts()`
  scales the web app's CSS sizes.
- **Motion** (`motion.rs`): springs for state (the List/Board and Month/Week pills slide, chevrons
  turn, a checked circle pops, the subtask progress bar), eased entrances for what appears (each
  screen fades and rises in, the task dialog and its backdrop, chart bars grow, the calendar slides
  in by month). A completed task stays listed for 0.9 s, checked and fading, before it leaves.

## Not there yet

Editing beyond completing, quick add, priority and habit check-ins; drag and drop; keyboard
shortcuts and the command palette; search and filters; sharing; notifications and the tray;
passkey sign-in and local-only accounts (atlastodo/atlas#124); weekly and
interval habit goals (streaks are daily); i18n (English strings); packaging, the updater and
macOS/Windows (only Linux, Wayland, was tried).
