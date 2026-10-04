//! The audit trail of admin actions: who did what to whom, when.
//!
//! Minimal on purpose -- one append-only table, written by every mutating admin action, read back as
//! a list in the panel. It is cheap to add now and near-impossible to retrofit meaningfully once
//! open-source deployments have history in production. Actors and targets are `ON DELETE SET NULL`,
//! so deleting a user preserves the record of what was done to them (or by them).

use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::admin::AdminUser;
use crate::error::AppResult;
use crate::state::AppState;

/// Admin routes, mounted under the `/admin` group by [`crate::admin::routes`].
pub fn admin_routes() -> Router<AppState> {
    Router::new().route("/admin/audit", get(list_audit))
}

/// Record one admin action. Takes any executor so callers inside a transaction (the user PATCHes)
/// record atomically with the action itself -- an action without its audit entry must not commit.
pub async fn record(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    actor_id: Uuid,
    action: &str,
    target_user_id: Option<Uuid>,
    details: Value,
) -> AppResult<()> {
    insert(executor, Some(actor_id), action, target_user_id, details).await
}

/// Record an action no signed-in admin took -- the deletion schedule, the `promote` CLI, the
/// deploy's `ADMIN_EMAILS` -- with a NULL actor. `details.source` says which.
pub async fn record_system(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    action: &str,
    target_user_id: Option<Uuid>,
    details: Value,
) -> AppResult<()> {
    insert(executor, None, action, target_user_id, details).await
}

async fn insert(
    executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
    actor_id: Option<Uuid>,
    action: &str,
    target_user_id: Option<Uuid>,
    details: Value,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO admin_actions (actor_id, action, target_user_id, details)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(actor_id)
    .bind(action)
    .bind(target_user_id)
    .bind(details)
    .execute(executor)
    .await?;
    Ok(())
}

/// One audit entry.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AuditEntryView {
    pub id: i64,
    pub actor_id: Option<Uuid>,
    pub actor_email: Option<String>,
    pub action: String,
    pub target_user_id: Option<Uuid>,
    pub target_email: Option<String>,
    pub details: Value,
    pub created_at_ms: i64,
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    #[serde(default)]
    limit: Option<i64>,
    /// Keyset cursor: return entries with an id strictly below this one (ids are monotonic).
    #[serde(default)]
    before_id: Option<i64>,
}

/// `GET /admin/audit` — newest-first, keyset-paginated on the identity column.
async fn list_audit(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<AuditEntryView>>> {
    let rows = sqlx::query_as::<_, AuditEntryView>(
        "SELECT a.id, a.actor_id, actor.email AS actor_email, a.action,
                a.target_user_id, target.email AS target_email, a.details,
                (EXTRACT(EPOCH FROM a.created_at) * 1000)::BIGINT AS created_at_ms
           FROM admin_actions a
           LEFT JOIN users actor ON actor.id = a.actor_id
           LEFT JOIN users target ON target.id = a.target_user_id
          WHERE ($1::BIGINT IS NULL OR a.id < $1)
          ORDER BY a.id DESC
          LIMIT $2",
    )
    .bind(q.before_id)
    .bind(q.limit.unwrap_or(50).clamp(1, 100))
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}
