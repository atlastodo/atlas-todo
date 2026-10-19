## v0.1.11

- **Passkeys:** sign in with a passkey on the web and on Android.
- **API tokens:** Settings → API tokens makes tokens for integrations such as n8n, used with the `atlas` CLI.
- **Accounts:** sign-up uses a root key, and existing accounts move to it when you sign in or unlock. This prepares one account for several Atlas apps.
- **Accessibility:** text contrast raised to 4.5:1, and the page language follows the UI language for screen readers.
- **New home:** the app now lives in its own repository, atlastodo/atlas-todo. The server, image and CLI are in [atlastodo/atlas](https://github.com/atlastodo/atlas), and the server image is now `ghcr.io/atlastodo/atlas`.

### Features
- Core package and web app tarballs, pinnable web build
- Publishable @atlastodo/client-core, shared and sdk
- Passkeys on the web and Android
- Ship the atlas CLI as static binaries, retire the JavaScript CLI
- Check the server's discovery before signing in or up
- Bundled app manifests own the plaintext-field policy
- Sign up with a root key and migrate accounts at sign-in or unlock
- Settings > API tokens
- Ship third-party licence notices and check JS licences in lint

### Fixes
- Allow insecure content only for an http server
- Linear-time regexes for synced rules, stack traces and Todoist imports
- Type pathImpl as typeof path for @types/node 26.6.5
- Raise grey text, placeholder and emerald/amber accent contrast to 4.5:1
- Keep the web page's language on the UI language for screen readers

### Documentation
- Send server links to atlastodo/atlas, keep app links on this repository
- README, contributing, security and agent guides for the app repository
- The repository split runbook, core package pinning and the web pin
- How to try it and get help, no telemetry, update checks, copyright
- Accessibility statement, issue form and PR checklist item

### Maintenance
- 4 dependency updates, 13 maintenance commits (CI, build, tests) ([full list](https://github.com/atlastodo/atlas-todo/compare/v0.1.10...v0.1.11))
