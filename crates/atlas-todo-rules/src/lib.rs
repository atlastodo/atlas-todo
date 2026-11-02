//! `atlas-todo-rules`: Atlas Todo's rules on Atlas core's engine (`atlas-client`), at parity with
//! `@atlastodo/todo-core` through the fixtures in `test-vectors/`:
//!
//! - [`register_todo_app`]: the todo app definition (`packages/todo-core/src/definition.json`),
//!   which tells the engine how todo's kinds scope to shared projects. Core has no todo rules.
//! - [`rules`]: the task rules, recurrence, quick add, filters and due dates.
//! - [`client`]: [`client::TodoClient`], what the `atlas-todo` CLI calls: tasks, projects and
//!   labels over an API-token session.

pub mod client;
pub mod rules;

use std::sync::Once;

use atlas_client::apps::{register_app, AppDefinition};

/// Atlas Todo's app definition, shared with the TypeScript package.
pub const TODO_APP_DEFINITION: &str =
    include_str!("../../../packages/todo-core/src/definition.json");

/// Register the todo app definition with the engine (once; every later call does nothing).
pub fn register_todo_app() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let def =
            AppDefinition::from_json(TODO_APP_DEFINITION).expect("the todo definition parses");
        register_app(def).expect("the todo definition registers");
    });
}
