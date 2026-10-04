//! Instance settings: deployment flags an admin can toggle at runtime instead of editing the env.
//!
//! The database row **overrides** the env default (`SIGNUP_ENABLED`), never replaces its role: with
//! no row -- the state of every pre-existing deploy, and of a fresh one -- the env value stands, and
//! deleting the row reverts to it. That keeps the env file the seed and the panel the day-to-day
//! control, so closing signup stops meaning "ssh in and restart".

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::admin::AdminUser;
use crate::audit;
use crate::error::AppResult;
use crate::state::AppState;

/// The one runtime-togglable flag today: whether `POST /auth/signup` accepts new accounts.
const SIGNUP_ENABLED_KEY: &str = "signup_enabled";

/// Admin routes, mounted under the `/admin` group by [`crate::admin::routes`].
pub fn admin_routes() -> Router<AppState> {
    Router::new().route("/admin/settings", get(get_settings).patch(patch_settings))
}

/// The **effective** value of the signup gate: the stored override when there is one, the env
/// default otherwise. An unparseable stored value is treated as "no row" rather than an error -- the
/// panel writes only `"true"`/`"false"`, so reaching that state means a hand-edit, and falling back
/// to the env default is safer than locking every signup out of the instance.
pub async fn signup_enabled(state: &AppState) -> AppResult<bool> {
    let stored: Option<String> =
        sqlx::query_scalar("SELECT value FROM instance_settings WHERE key = $1")
            .bind(SIGNUP_ENABLED_KEY)
            .fetch_optional(&state.pool)
            .await?;
    Ok(match stored.as_deref() {
        Some("true") => true,
        Some("false") => false,
        _ => state.config.signup_enabled,
    })
}

#[derive(Debug, Serialize)]
pub struct SettingsView {
    /// The effective value -- what a signup attempt right now would see -- so the panel's toggle
    /// always reflects reality even when the env default, not the panel, is in charge.
    pub signup_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct PatchSettingsRequest {
    pub signup_enabled: bool,
}

/// `GET /admin/settings`
async fn get_settings(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<SettingsView>> {
    Ok(Json(SettingsView {
        signup_enabled: signup_enabled(&state).await?,
    }))
}

/// `PATCH /admin/settings` — upsert the override and return the (unchanged-shape) effective view.
async fn patch_settings(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(req): Json<PatchSettingsRequest>,
) -> AppResult<Json<SettingsView>> {
    // The change and its audit entry commit together.
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "INSERT INTO instance_settings (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3",
    )
    .bind(SIGNUP_ENABLED_KEY)
    .bind(if req.signup_enabled { "true" } else { "false" })
    .bind(admin.user_id)
    .execute(&mut *tx)
    .await?;
    audit::record(
        &mut *tx,
        admin.user_id,
        "settings.update",
        None,
        serde_json::json!({ "signup_enabled": req.signup_enabled }),
    )
    .await?;
    tx.commit().await?;
    get_settings(State(state), admin).await
}
