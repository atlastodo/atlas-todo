//! Small building blocks shared by the screens.

use gpui::{
    div, prelude::*, px, relative, svg, AnyElement, App, ElementId, Hsla, IntoElement, Rgba,
    SharedString, Transformation, Window,
};

use crate::motion;
use crate::theme::Theme;

/// Text at the web app's size. GPUI draws the same font about 14% larger than Chromium at the
/// same pixel size, so sizes given as the web app's CSS pixels are scaled to match.
pub fn ts(css_px: f32) -> gpui::Pixels {
    px(css_px * 0.875)
}

/// A Lucide icon from `assets/icons`, tinted.
pub fn icon(name: &str, size: f32, color: impl Into<Hsla>) -> gpui::Svg {
    svg()
        .path(SharedString::from(format!("icons/{name}.svg")))
        .size(px(size))
        .flex_none()
        .text_color(color.into())
}

/// The completion circle of a task, as `TaskRow`'s: grey ring, or a filled accent check when done.
pub fn check_circle(size: f32, done: bool, ring: Rgba, t: &Theme) -> gpui::Div {
    let base = div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .flex()
        .items_center()
        .justify_center();
    if done {
        base.bg(t.accent)
            .child(icon("check", size * 0.65, t.on_accent))
    } else {
        base.border(px(1.5)).border_color(ring)
    }
}

/// A tinted chip: a date, a label, a subtask count.
pub fn chip(t: &Theme) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap(px(5.))
        .px(px(6.))
        .py(px(2.))
        .rounded(px(4.))
        .bg(t.chip)
        .text_size(ts(15.))
        .text_color(t.muted)
}

pub fn dot(size: f32, color: impl Into<Hsla>) -> gpui::Div {
    div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .bg(color.into())
}

/// An uppercase heading over a group ("DESIGN", "PROPERTIES", "COMPLETED PER DAY").
pub fn caps(text: impl Into<SharedString>, t: &Theme) -> gpui::Div {
    let s: SharedString = text.into();
    div()
        .text_size(ts(12.))
        .font_weight(gpui::FontWeight::SEMIBOLD)
        .text_color(t.faint)
        .child(SharedString::from(s.to_uppercase()))
}

/// A segmented control ("List | Board", "Month | Week"): equal segments over an accent pill that
/// springs to the picked one.
pub fn segmented<F>(
    id: impl Into<SharedString>,
    items: &[&str],
    active: usize,
    stretch: bool,
    t: &Theme,
    on_pick: F,
) -> gpui::Stateful<gpui::Div>
where
    F: Fn(usize, &mut Window, &mut App) + Clone + 'static,
{
    let id: SharedString = id.into();
    let n = items.len().max(1) as f32;
    let pill = div()
        .absolute()
        .top_0()
        .bottom_0()
        .w(relative(1. / n))
        .rounded(px(8.))
        .bg(t.accent);
    let pill = motion::spring(
        pill,
        SharedString::from(format!("{id}-pill")),
        motion::SNAPPY,
        active as f32,
        move |el, v| el.left(relative(v / n)),
    );
    let mut track = div().relative().flex().child(pill);
    if stretch {
        track = track.w_full();
    }
    for (i, label) in items.iter().enumerate() {
        let on = i == active;
        let pick = on_pick.clone();
        let seg = div()
            .id(SharedString::from(format!("{id}-{i}")))
            .py(px(6.))
            .flex()
            .justify_center()
            .text_size(ts(15.))
            .cursor_pointer()
            .on_click(move |_, w, cx| pick(i, w, cx))
            .child(SharedString::from(label.to_string()))
            .map(|d| if stretch { d.flex_1() } else { d.w(px(76.)) })
            .map(|d| {
                if on {
                    d.text_color(t.on_accent)
                        .font_weight(gpui::FontWeight::SEMIBOLD)
                } else {
                    d.text_color(t.text_soft)
                }
            });
        track = track.child(seg);
    }
    div()
        .id(id.clone())
        .flex()
        .p(px(4.))
        .rounded(px(12.))
        .border_1()
        .border_color(t.border)
        .bg(if t.dark {
            t.surface
        } else {
            gpui::rgb(0xf5f5f5)
        })
        .when(stretch, |d| d.w_full())
        .child(track)
}

/// A chevron that springs between pointing down (open) and right (closed).
pub fn chevron(
    id: impl Into<ElementId>,
    open: bool,
    size: f32,
    color: impl Into<Hsla>,
) -> AnyElement {
    motion::spring(
        icon("chevron-down", size, color),
        id,
        motion::SMOOTH,
        if open { 0. } else { -90. },
        |el, deg| el.with_transformation(Transformation::rotate(gpui::radians(deg.to_radians()))),
    )
}

/// The tools in a screen's title row: larger than a section's.
pub fn header_tools(names: &[&str], t: &Theme) -> gpui::Div {
    div().flex().items_center().gap(px(22.)).children(
        names
            .iter()
            .map(|n| icon(n, 20., t.muted).into_any_element())
            .collect::<Vec<AnyElement>>(),
    )
}

/// A row of icon buttons in a header (no actions behind them yet: the GPUI app is read-mostly).
pub fn header_icons(names: &[&str], t: &Theme) -> gpui::Div {
    div().flex().items_center().gap(px(18.)).children(
        names
            .iter()
            .map(|n| icon(n, 16., t.faint).into_any_element())
            .collect::<Vec<AnyElement>>(),
    )
}
