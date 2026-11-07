//! The password session between runs: its credentials (refresh token and keys) in the system's
//! secret store (Secret Service: GNOME Keyring, KWallet), never in a file.

use atlas_client::session::SessionCredentials;

const SERVICE: &str = "dev.atlastodo.gpui";
const ENTRY: &str = "session";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ENTRY).map_err(|e| e.to_string())
}

pub fn load() -> Option<SessionCredentials> {
    let text = entry().ok()?.get_password().ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save(credentials: &SessionCredentials) -> Result<(), String> {
    let text = serde_json::to_string(credentials).map_err(|e| e.to_string())?;
    entry()?.set_password(&text).map_err(|e| e.to_string())
}

pub fn clear() {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
}
