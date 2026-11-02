## v0.1.17

### Breaking changes
- Atlas Todo's command line moved here: the `atlas-todo` CLI (`atlas-todo-0.1.17-<target>` below), with the same commands, environment and output as the `atlas tasks|projects|labels|changes` commands of core's `atlas` CLI, which dropped them in core 0.1.15.
- The app needs Atlas core 0.1.15, whose sync engine is app-agnostic; todo's rules now live in this repository (`packages/todo-core`).

### Features
- Own Atlas Todo's domain: todo-core and the atlas-todo CLI
- Activity page per view, with undo

### Fixes
- Review fixes for the activity page
- Turn off the Java language server
- Fall back to nix run when devenv is not on PATH
- Group a task row's markers, date and hover actions
- Slide a task row's meta aside for its hover actions
- Tidy keyboard focus on the Today page
- Inset the app-wide keyboard focus ring
- Inset the sidebar rows' keyboard focus ring

### Documentation
- Play the trailer inline in the README
- Add the trailer to the README
- Never mention AI in commits, PRs or releases

### Maintenance
- 7 dependency updates, 2 maintenance commits (CI, build, tests) ([full list](https://github.com/atlastodo/atlas-todo/compare/v0.1.16...v0.1.17))
