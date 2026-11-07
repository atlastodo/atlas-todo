//! Motion: springs for state-driven transitions (a segmented control's pill, chevrons, the check's
//! pop) and short eased animations for things that appear (screens, the task dialog, chart bars).
//! Off in the screenshot mode, which renders one frame: everything is drawn at rest.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use gpui::{
    ease_out_quint, Animation, AnimationExt, AnyElement, ElementId, IntoElement, SpringAnimation,
    SpringConfig,
};

static ENABLED: AtomicBool = AtomicBool::new(true);

#[cfg(feature = "screenshots")]
pub fn disable() {
    ENABLED.store(false, Ordering::Relaxed);
}

pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Quick and slightly bouncy: pills, checks.
pub const SNAPPY: SpringConfig = SpringConfig::new(520.0, 34.0, 1.0);
/// Settles without overshoot: chevrons, panels.
pub const SMOOTH: SpringConfig = SpringConfig::new(300.0, 36.0, 1.0);

/// Play `f` from 0 to 1 over `ms` milliseconds (ease-out) when the element with `id` first mounts.
pub fn enter<E>(
    el: E,
    id: impl Into<ElementId>,
    ms: u64,
    f: impl Fn(E, f32) -> E + 'static,
) -> AnyElement
where
    E: IntoElement + 'static,
{
    if !enabled() {
        return f(el, 1.0).into_any_element();
    }
    el.with_animation(
        id,
        Animation::new(Duration::from_millis(ms)).with_easing(ease_out_quint()),
        f,
    )
    .into_any_element()
}

/// Follow `target` with a spring; `f` gets the current value.
pub fn spring<E>(
    el: E,
    id: impl Into<ElementId>,
    config: SpringConfig,
    target: f32,
    f: impl FnOnce(E, f32) -> E + 'static,
) -> AnyElement
where
    E: IntoElement + 'static,
{
    if !enabled() {
        return f(el, target).into_any_element();
    }
    el.with_spring(id, SpringAnimation::new(config).to(target), f)
        .into_any_element()
}

/// Like [`spring`], starting from `from` when it mounts.
pub fn spring_from<E>(
    el: E,
    id: impl Into<ElementId>,
    config: SpringConfig,
    from: f32,
    target: f32,
    f: impl FnOnce(E, f32) -> E + 'static,
) -> AnyElement
where
    E: IntoElement + 'static,
{
    if !enabled() {
        return f(el, target).into_any_element();
    }
    el.with_spring(id, SpringAnimation::new(config).to(target).from(from), f)
        .into_any_element()
}
