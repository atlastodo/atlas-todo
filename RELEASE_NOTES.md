## v0.1.16-rc.1

**Breaking:** this release speaks sync protocol 7 (core v0.1.14-rc.1), which hides item kinds, field
names and links from the server. It needs a server on core v0.1.14-rc.1 or later, and such a server
refuses older apps. Existing data migrates itself on the first sync.

### Features
- Seal the invite preview for sync protocol 7

### Maintenance
- 1 dependency update ([full list](https://github.com/atlastodo/atlas-todo/compare/v0.1.15...v0.1.16-rc.1))
