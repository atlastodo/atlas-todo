//! The password KDF an account's credential derives from: its version and parameters.
//!
//! The server never runs the KDF. The client derives the auth hash and key-wrapping key from the
//! password and must know which KDF to run before signing in, so the server stores the choice
//! per account, hands it out with the salt and bound-checks what clients ask it to store.
//!
//! - 1: PBKDF2-HMAC-SHA256 over the UTF-8 password as typed, 600 000 iterations (older accounts).
//! - 2: Argon2id (RFC 9106, 0x13) over the NFC-normalized password (current).
//!
//! The bounds are the client's (`packages/client-core/src/crypto/kdf.ts`); storing anything the
//! client would refuse would only lock the account.

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

const PBKDF2_ITERATIONS: u32 = 600_000;
/// Argon2id bounds; the current parameters are the floor.
const ARGON2_MEMORY_KIB: (u32, u32) = (65_536, 262_144);
const ARGON2_ITERATIONS: (u32, u32) = (3, 10);
const ARGON2_PARALLELISM: (u32, u32) = (1, 4);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kdf {
    Pbkdf2 {
        iterations: u32,
    },
    Argon2id {
        memory_kib: u32,
        iterations: u32,
        parallelism: u32,
    },
}

impl Kdf {
    pub const LEGACY: Kdf = Kdf::Pbkdf2 {
        iterations: PBKDF2_ITERATIONS,
    };
    /// What current clients write; also the answer for an unknown address, so it must match signup.
    pub const CURRENT: Kdf = Kdf::Argon2id {
        memory_kib: ARGON2_MEMORY_KIB.0,
        iterations: ARGON2_ITERATIONS.0,
        parallelism: ARGON2_PARALLELISM.0,
    };

    pub fn version(&self) -> i16 {
        match self {
            Kdf::Pbkdf2 { .. } => 1,
            Kdf::Argon2id { .. } => 2,
        }
    }

    /// The `kdf_params` object, built identically for a stored row and the unknown-address dummy.
    pub fn params(&self) -> Value {
        match *self {
            Kdf::Pbkdf2 { iterations } => json!({ "iterations": iterations }),
            Kdf::Argon2id {
                memory_kib,
                iterations,
                parallelism,
            } => json!({
                "iterations": iterations,
                "memory_kib": memory_kib,
                "parallelism": parallelism,
            }),
        }
    }

    /// Parse and bound-check a version and parameters; `None` for an unknown version, missing or
    /// extra parameter, or out-of-bounds value.
    pub fn parse(version: i16, params: &Value) -> Option<Kdf> {
        let fields = params.as_object()?;
        let field = |name: &str| -> Option<u32> { u32::try_from(fields.get(name)?.as_u64()?).ok() };
        let within = |value: u32, (min, max): (u32, u32)| (min..=max).contains(&value);
        match version {
            1 => {
                let iterations = field("iterations")?;
                (fields.len() == 1 && iterations == PBKDF2_ITERATIONS)
                    .then_some(Kdf::Pbkdf2 { iterations })
            }
            2 => {
                let memory_kib = field("memory_kib")?;
                let iterations = field("iterations")?;
                let parallelism = field("parallelism")?;
                (fields.len() == 3
                    && within(memory_kib, ARGON2_MEMORY_KIB)
                    && within(iterations, ARGON2_ITERATIONS)
                    && within(parallelism, ARGON2_PARALLELISM))
                .then_some(Kdf::Argon2id {
                    memory_kib,
                    iterations,
                    parallelism,
                })
            }
            _ => None,
        }
    }

    /// The KDF a stored row names; an unparseable row reads as [`Kdf::LEGACY`], the column default.
    pub fn from_row(version: i16, params: &Value) -> Kdf {
        Kdf::parse(version, params).unwrap_or(Kdf::LEGACY)
    }

    /// The KDF a request says its credential was derived with; none means version 1.
    pub fn from_request(version: Option<i16>, params: Option<&Value>) -> AppResult<Kdf> {
        match (version, params) {
            (None, None) => Ok(Kdf::LEGACY),
            (Some(version), Some(params)) => Kdf::parse(version, params).ok_or_else(|| {
                AppError::BadRequest("kdf_version and kdf_params are not supported".into())
            }),
            _ => Err(AppError::BadRequest(
                "kdf_version and kdf_params go together".into(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_constants_parse_back_to_themselves() {
        for kdf in [Kdf::LEGACY, Kdf::CURRENT] {
            assert_eq!(Kdf::parse(kdf.version(), &kdf.params()), Some(kdf));
        }
        assert_eq!(Kdf::CURRENT.version(), 2);
        assert_eq!(
            Kdf::CURRENT.params(),
            json!({ "iterations": 3, "memory_kib": 65536, "parallelism": 1 })
        );
    }

    #[test]
    fn parameters_outside_the_client_bounds_are_refused() {
        let argon = |m: u64, t: u64, p: u64| {
            Kdf::parse(
                2,
                &json!({ "memory_kib": m, "iterations": t, "parallelism": p }),
            )
        };
        assert!(argon(65_536, 3, 1).is_some());
        assert!(argon(262_144, 10, 4).is_some());
        assert!(argon(65_535, 3, 1).is_none(), "less memory than the floor");
        assert!(
            argon(262_145, 3, 1).is_none(),
            "more memory than a phone can spare"
        );
        assert!(argon(65_536, 2, 1).is_none());
        assert!(argon(65_536, 11, 1).is_none());
        assert!(argon(65_536, 3, 0).is_none());
        assert!(argon(65_536, 3, 5).is_none());
        assert!(argon(u64::from(u32::MAX) + 1, 3, 1).is_none());
        assert!(
            Kdf::parse(
                2,
                &json!({ "memory_kib": 65536, "iterations": 3, "parallelism": 1, "x": 1 })
            )
            .is_none(),
            "an unknown parameter"
        );
        assert!(Kdf::parse(2, &json!({ "memory_kib": 65536, "iterations": 3 })).is_none());
        assert!(Kdf::parse(
            2,
            &json!({ "memory_kib": "65536", "iterations": 3, "parallelism": 1 })
        )
        .is_none());
        assert!(Kdf::parse(2, &json!([65536, 3, 1])).is_none());

        assert!(Kdf::parse(1, &json!({ "iterations": 600_000 })).is_some());
        assert!(Kdf::parse(1, &json!({ "iterations": 1 })).is_none());
        assert!(Kdf::parse(1, &json!({ "iterations": 600_001 })).is_none());
        assert!(
            Kdf::parse(3, &Kdf::CURRENT.params()).is_none(),
            "an unknown version"
        );
        assert!(Kdf::parse(0, &json!({})).is_none());
    }

    #[test]
    fn a_request_without_kdf_fields_derived_with_version_1() {
        assert_eq!(Kdf::from_request(None, None).unwrap(), Kdf::LEGACY);
        assert_eq!(
            Kdf::from_request(Some(2), Some(&Kdf::CURRENT.params())).unwrap(),
            Kdf::CURRENT
        );
        assert!(Kdf::from_request(Some(2), None).is_err());
        assert!(Kdf::from_request(None, Some(&Kdf::CURRENT.params())).is_err());
        assert!(Kdf::from_request(Some(2), Some(&json!({}))).is_err());
    }

    #[test]
    fn an_unreadable_row_reads_as_legacy() {
        assert_eq!(Kdf::from_row(9, &json!(null)), Kdf::LEGACY);
        assert_eq!(Kdf::from_row(2, &Kdf::CURRENT.params()), Kdf::CURRENT);
    }
}
