//! Hybrid Logical Clock (HLC).
//!
//! An HLC pairs physical wall-clock time (milliseconds) with a logical counter so that
//! events across offline devices get a total, causally-consistent ordering even when the
//! machines' wall clocks drift. Timestamps are compared by `(wall_ms, counter, node)`.
//!
//! This is the ordering primitive behind our field-level last-writer-wins sync: whichever
//! operation carries the greater [`Hlc`] wins, with `node` (a device id) as the final,
//! deterministic tiebreak so every replica converges on the same result.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use uuid::Uuid;

/// A hybrid logical clock timestamp.
///
/// Ordering is defined by `wall_ms`, then `counter`, then `node`. The `node` tiebreak
/// guarantees a total order so independent replicas resolve conflicts identically.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hlc {
    /// Physical time component, milliseconds since the Unix epoch.
    pub wall_ms: u64,
    /// Logical counter, incremented when multiple events share a `wall_ms`.
    pub counter: u32,
    /// The device/replica that produced this timestamp; the final tiebreak.
    pub node: Uuid,
}

impl Hlc {
    /// Smallest possible timestamp for a given node — useful as an initial "seen nothing" value.
    pub fn zero(node: Uuid) -> Self {
        Self {
            wall_ms: 0,
            counter: 0,
            node,
        }
    }
}

impl PartialOrd for Hlc {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Hlc {
    fn cmp(&self, other: &Self) -> Ordering {
        self.wall_ms
            .cmp(&other.wall_ms)
            .then(self.counter.cmp(&other.counter))
            .then(self.node.cmp(&other.node))
    }
}

/// A stateful clock that mints monotonically increasing [`Hlc`] timestamps for one device.
///
/// `now` and `update` implement the standard HLC algorithm (Kulkarni et al.). Both are driven
/// by an injected physical time so the logic is fully deterministic under test.
#[derive(Debug, Clone)]
pub struct HlcClock {
    node: Uuid,
    last: Hlc,
}

impl HlcClock {
    /// Create a clock for `node` starting from the zero timestamp.
    pub fn new(node: Uuid) -> Self {
        Self {
            node,
            last: Hlc::zero(node),
        }
    }

    /// The most recent timestamp this clock emitted or observed.
    pub fn last(&self) -> Hlc {
        self.last
    }

    /// Generate a timestamp for a local event, given the current physical time in ms.
    ///
    /// If the physical clock advanced past our last timestamp we adopt it and reset the
    /// counter; otherwise we keep the last wall time and bump the counter so the new
    /// timestamp still strictly exceeds the previous one.
    pub fn now(&mut self, physical_ms: u64) -> Hlc {
        let wall = physical_ms.max(self.last.wall_ms);
        let counter = if wall == self.last.wall_ms {
            self.last.counter + 1
        } else {
            0
        };
        self.last = Hlc {
            wall_ms: wall,
            counter,
            node: self.node,
        };
        self.last
    }

    /// Update this clock upon receiving `remote`, returning a fresh local timestamp that
    /// dominates both our previous state and the remote timestamp.
    pub fn update(&mut self, remote: Hlc, physical_ms: u64) -> Hlc {
        let wall = physical_ms.max(self.last.wall_ms).max(remote.wall_ms);
        let counter = if wall == self.last.wall_ms && wall == remote.wall_ms {
            self.last.counter.max(remote.counter) + 1
        } else if wall == self.last.wall_ms {
            self.last.counter + 1
        } else if wall == remote.wall_ms {
            remote.counter + 1
        } else {
            0
        };
        self.last = Hlc {
            wall_ms: wall,
            counter,
            node: self.node,
        };
        self.last
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(n: u128) -> Uuid {
        Uuid::from_u128(n)
    }

    #[test]
    fn now_is_strictly_monotonic_even_without_physical_progress() {
        let mut clock = HlcClock::new(node(1));
        let a = clock.now(1000);
        let b = clock.now(1000); // same physical time
        let c = clock.now(1000);
        assert!(a < b, "counter must advance when wall time stalls");
        assert!(b < c);
        assert_eq!(c.counter, 2);
        assert_eq!(c.wall_ms, 1000);
    }

    #[test]
    fn now_adopts_advancing_physical_time_and_resets_counter() {
        let mut clock = HlcClock::new(node(1));
        clock.now(1000);
        clock.now(1000);
        let t = clock.now(2000);
        assert_eq!(t.wall_ms, 2000);
        assert_eq!(t.counter, 0);
    }

    #[test]
    fn now_ignores_backwards_physical_clock() {
        let mut clock = HlcClock::new(node(1));
        let a = clock.now(5000);
        let b = clock.now(1000); // clock jumped backwards
        assert!(a < b);
        assert_eq!(b.wall_ms, 5000, "wall time must not go backwards");
        assert_eq!(b.counter, 1);
    }

    #[test]
    fn update_dominates_remote_timestamp() {
        let mut clock = HlcClock::new(node(1));
        let remote = Hlc {
            wall_ms: 9000,
            counter: 3,
            node: node(2),
        };
        let local = clock.update(remote, 1000);
        assert!(local > remote);
        assert_eq!(local.node, node(1));
        assert_eq!(local.wall_ms, 9000);
    }

    #[test]
    fn ordering_breaks_ties_by_node() {
        let lo = Hlc {
            wall_ms: 1,
            counter: 0,
            node: node(1),
        };
        let hi = Hlc {
            wall_ms: 1,
            counter: 0,
            node: node(2),
        };
        assert!(lo < hi);
    }

    #[test]
    fn ordering_prefers_wall_then_counter() {
        let a = Hlc {
            wall_ms: 1,
            counter: 9,
            node: node(9),
        };
        let b = Hlc {
            wall_ms: 2,
            counter: 0,
            node: node(1),
        };
        assert!(a < b, "wall time dominates the counter");
    }
}
