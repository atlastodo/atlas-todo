//! Shared application state threaded through Axum handlers.

use std::sync::{Arc, Mutex};

use atlas_core::HlcClock;
use sqlx::PgPool;
use uuid::Uuid;

use crate::attachments::BlobStore;
use crate::config::Config;
use crate::sync::SyncHub;

/// Cloneable handle to the database pool, configuration, and the live-sync hub. Cheap to clone
/// (Arc + pool handle).
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    /// Per-user broadcast channels for realtime op delivery over WebSocket.
    pub hub: Arc<SyncHub>,
    /// Server-side HLC for **server-authored** ops (membership fan-out, invite-accept backfill).
    /// A fresh per-boot node id keeps these timestamps distinct from any client device.
    pub clock: Arc<Mutex<HlcClock>>,
    /// The attachment blob store, or `None` when attachments are off.
    pub blobs: Option<BlobStore>,
}

impl AppState {
    /// Panics when the config names a blob store it cannot build, which [`Config::from_env`]
    /// already refuses.
    pub fn new(pool: PgPool, config: Config) -> Self {
        let blobs = BlobStore::from_config(&config).expect("blob store config");
        Self {
            pool,
            config: Arc::new(config),
            hub: Arc::new(SyncHub::default()),
            clock: Arc::new(Mutex::new(HlcClock::new(Uuid::now_v7()))),
            blobs,
        }
    }

    /// The same state over another blob store (tests run the object-store backend in memory).
    pub fn with_blob_store(mut self, store: BlobStore) -> Self {
        self.blobs = Some(store);
        self
    }
}
