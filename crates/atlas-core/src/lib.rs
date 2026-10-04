//! `atlas-core` — shared sync primitives for Atlas Todo.
//!
//! The hybrid logical clock ([`hlc`]) and the operation log types ([`op`]) the server stores and
//! relays. It has no I/O and no database dependency. Conflict resolution and recurrence run on
//! the clients, in TypeScript.

pub mod hlc;
pub mod op;

pub use hlc::{Hlc, HlcClock};
pub use op::{Change, EntityKind, Operation};
