/**
 * The browser has no native PBKDF2 to register: client-core's `deriveAuthAndMekAsync`
 * (`crypto/kdf.ts`) already takes the WebCrypto path, which is as fast. Metro resolves this in
 * place of `nativePbkdf2.ts` on web, keeping `react-native-quick-crypto` out of the bundle.
 */
export function registerNativePbkdf2(): void {}
