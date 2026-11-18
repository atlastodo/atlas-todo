## v0.1.20

### Features
- Confirm every quick-add with a toast saying where it went
- Drag an overdue task onto Today to do it today
- Publish the server image ghcr.io/atlastodo/atlas-todo

### Fixes
- Send the sign-in credential with a new signing key
- Explain why a token needs a recovery phrase
- Key and deliver projects only on the owner's own trust facts
- Refuse a server account id that could name local storage
- File tasks by name into the account's own project first
- Keep another owner's projects out of a folder's purge
- Bind a comment's author to the account that pushed it
- Undo a section entry only for a section of its project
- Build task and folder trees without recursion
- Resolve project icons only from the icon map's own names
- Clear a reminder from the shade and confirm Complete with a toast

### Changes
- Flake update
- Update flake

### Documentation
- Say that Expo updates are not code-signed yet

### Maintenance
- 9 dependency updates, 2 maintenance commits (CI, build, tests) ([full list](https://github.com/atlastodo/atlas-todo/compare/v0.1.19...v0.1.20))
