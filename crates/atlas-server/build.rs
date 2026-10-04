// `sqlx::migrate!` embeds the repo-root migrations/ at compile time, but a proc macro can't tell
// cargo about the files it read: without this, adding a migration leaves a stale binary that never
// applies it.
fn main() {
    println!("cargo:rerun-if-changed=../../migrations");
}
