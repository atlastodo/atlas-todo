//! Derived entity ids (`packages/todo-core/src/ids.ts`).

use sha2::{Digest, Sha256};

/// SHA-256 over `namespace NUL key`, as an RFC 9562 version-8 UUID (`derivedUuidV2`).
/// Deterministic, so offline devices converge on one row: a habit's check-in for a day is
/// `derived_uuid_v2("habit_checkin", "<habit_id>\0<date>")` on every device.
pub fn derived_uuid_v2(namespace: &str, key: &str) -> String {
    let digest = Sha256::digest(format!("{namespace}\0{key}").as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x80; // version 8
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
    uuid::Uuid::from_bytes(bytes).to_string()
}

#[cfg(test)]
mod tests {
    use super::derived_uuid_v2;

    #[test]
    fn matches_the_pinned_typescript_output() {
        // `PINNED_V2` in packages/todo-core/src/ids.test.ts.
        assert_eq!(
            derived_uuid_v2("habit_checkin", "h1\u{0}2026-07-06"),
            "f03f5286-b08a-80c7-84d5-b75ae1a24cd1"
        );
    }
}
