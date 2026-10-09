## v0.1.9-rc.1

### Features
- Explain storage and notification permissions before prompting
- Ctrl+Q fully quits the app, even with Close to tray on

### Fixes
- Keep Plan your day's Apply reachable with the picker open
- Pack task row markers against the due date
- Audit dynamic SQL for sqlx 0.9 and raise the MSRV to 1.94
- Move to the rand 0.10 API (rng(), Rng)
- Build AES-GCM nonces with TryFrom for aes-gcm 0.11
- Select jsonwebtoken's rust_crypto provider
- Override source-map-js and postcss-selector-parser past their advisories
- Capture phone shots with a touch pointer

### Changes
- Ignore RUSTSEC-2023-0071 (rsa is unreachable, the server only uses HS256)
- Bump aes-gcm from 0.10.3 to 0.11.1
- Keep Dependabot off Tailwind majors until nativewind 5
- Bump sqlx from 0.8.6 to 0.9.0
- Bump base64 from 0.22.1 to 0.23.1
- Bump rand from 0.8.6 to 0.10.3
- Bump jsonwebtoken from 9.3.1 to 11.1.0
- Keep Dependabot off the packages the Expo SDK pins
- Bump electron from 43.6.0 to 44.5.1
- Bump argon2, hkdf, hmac, sha2 and x25519-dalek
- Raise the MSRV to Rust 1.89
- Bump the cargo-minor-patch group with 3 updates
- Bump tokio-tungstenite from 0.29.0 to 0.30.0
- Bump taiki-e/install-action
