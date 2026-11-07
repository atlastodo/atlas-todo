//! The task rules of `@atlastodo/todo-core` (`packages/todo-core`, and its SDK's `parseDue`), checked
//! against the fixtures in `test-vectors/` that the TypeScript tests read too.

pub mod dates;
pub mod filter;
pub mod habit_groups;
pub mod habits;
pub mod ids;
pub mod quick_add;
pub mod recurrence;
pub mod task;

#[cfg(test)]
mod habit_vectors;
#[cfg(test)]
mod vectors;
