//! The task rules of `@atlastodo/todo-core` (`packages/todo-core`, and its SDK's `parseDue`), checked
//! against the fixtures in `test-vectors/` that the TypeScript tests read too.

pub mod countdown;
pub mod dates;
pub mod filter;
pub mod pomodoro;
pub mod quick_add;
pub mod recurrence;
pub mod reminders;
pub mod task;

#[cfg(test)]
mod vectors;
