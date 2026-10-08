//! Password hashing with Argon2id.
//!
//! We store only the PHC-string hash (`$argon2id$...`), never the plaintext. Verification is
//! constant-time via the argon2 crate. Parameters use the crate defaults, which are a sensible
//! interactive-login baseline.

use argon2::password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::Argon2;

/// Hash a plaintext password with a fresh random salt, returning a PHC string suitable for storage.
pub fn hash_password(plaintext: &str) -> Result<String, argon2::password_hash::Error> {
    let hash: PasswordHash = Argon2::default().hash_password(plaintext.as_bytes())?;
    Ok(hash.to_string())
}

/// Verify `plaintext` against a stored PHC hash. Returns `Ok(false)` on mismatch, `Err` only if
/// the stored hash is malformed.
pub fn verify_password(
    plaintext: &str,
    phc_hash: &str,
) -> Result<bool, argon2::password_hash::Error> {
    let parsed = PasswordHash::new(phc_hash)?;
    match Argon2::default().verify_password(plaintext.as_bytes(), &parsed) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::PasswordInvalid) => Ok(false),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_roundtrips() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(hash.starts_with("$argon2"));
        assert!(verify_password("correct horse battery staple", &hash).unwrap());
    }

    #[test]
    fn wrong_password_does_not_verify() {
        let hash = hash_password("s3cret").unwrap();
        assert!(!verify_password("not it", &hash).unwrap());
    }

    #[test]
    fn hashes_are_salted_and_differ() {
        let a = hash_password("same").unwrap();
        let b = hash_password("same").unwrap();
        assert_ne!(a, b, "unique salt per hash");
    }

    #[test]
    fn malformed_hash_is_an_error() {
        assert!(verify_password("x", "not-a-phc-string").is_err());
    }
}
