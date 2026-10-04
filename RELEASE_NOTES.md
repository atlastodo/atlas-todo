## v0.1.0

The first public release of Atlas Todo: a self-hostable to-do app with end-to-end encryption.

- One small server (Rust + PostgreSQL) for the web, Android and the Linux desktop app. It stores
  your tasks but cannot read them.
- Offline-first: every change is saved on the device and synced as field-level edits, live over
  a WebSocket.
- Projects, sections, labels, subtasks, priorities, start and due dates, recurrence, reminders,
  list, board and calendar views, saved filters, quick add with natural-language dates, habits,
  a focus timer and stats.
- Sharing: invite people on the same server to a project as editors or commenters.
- Self-hosting with Docker Compose (`ghcr.io/atlastodo/atlas-todo`, amd64 and arm64) or the NixOS
  module. See [docs/self-hosting.md](docs/self-hosting.md).
