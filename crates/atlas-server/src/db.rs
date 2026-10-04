//! Database pool creation and migrations.

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// Connect eagerly to Postgres with a bounded pool.
pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

/// Apply all pending migrations from the repo-root `migrations/` directory. Idempotent: sqlx
/// records applied migrations and takes an advisory lock, so concurrent callers are safe.
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("../../migrations").run(pool).await
}
