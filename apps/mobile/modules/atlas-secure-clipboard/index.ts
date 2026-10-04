import { requireOptionalNativeModule } from "expo";

interface AtlasSecureClipboard {
  setSensitiveStringAsync(content: string): Promise<boolean>;
}

/** The Android module, or null where it is not built in (iOS, the web, tests). */
export const SecureClipboard =
  requireOptionalNativeModule<AtlasSecureClipboard>("AtlasSecureClipboard");
