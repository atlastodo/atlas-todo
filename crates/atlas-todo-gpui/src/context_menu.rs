//! The right-click menu of a task row or board card (`TaskContextMenu` on the web): complete,
//! priority, due presets, move, duplicate, delete. It opens at the pointer, kept on screen, and
//! closes on a click outside it.

use gpui::{
    anchored, deferred, div, point, prelude::*, px, AnyElement, ClickEvent, Context, FontWeight,
    MouseDownEvent, Pixels, Point, SharedString,
};
use serde_json::Value;

use atlas_todo_rules::rules::task::ms;

use crate::app::AtlasApp;
use crate::edit;
use crate::motion;
use crate::theme::{priority_color, Theme, RED};
use crate::ui::{icon, ts};

pub struct Menu {
    pub task_id: String,
    pub pos: Point<Pixels>,
    /// Showing the "Move to" list instead of the actions.
    pub moving: bool,
}

/// Open the menu for a task at the pointer.
pub fn open(app: &mut AtlasApp, task_id: &str, ev: &MouseDownEvent, cx: &mut Context<AtlasApp>) {
    cx.stop_propagation();
    app.menu = Some(Menu {
        task_id: task_id.to_owned(),
        pos: ev.position,
        moving: false,
    });
    cx.notify();
}

pub fn close(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    app.menu = None;
    cx.notify();
}

fn heading(text: &str, t: &Theme) -> gpui::Div {
    div()
        .px(px(8.))
        .pt(px(2.))
        .pb(px(4.))
        .text_size(ts(12.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(t.muted)
        .child(SharedString::from(text.to_owned()))
}

fn rule(t: &Theme) -> gpui::Div {
    div().my(px(4.)).h(px(1.)).bg(t.divider)
}

/// A row of the menu; the listener runs and the menu closes.
fn item(
    key: &str,
    glyph: &str,
    label: &str,
    (selected, danger): (bool, bool),
    t: &Theme,
    cx: &mut Context<AtlasApp>,
    run: impl Fn(&mut AtlasApp, &mut Context<AtlasApp>) + 'static,
) -> AnyElement {
    let red = gpui::rgb(RED);
    div()
        .id(SharedString::from(format!("menu-{key}")))
        .h(px(32.))
        .px(px(8.))
        .flex()
        .items_center()
        .gap(px(10.))
        .rounded(px(6.))
        .cursor_pointer()
        .text_size(ts(14.))
        .when(selected, |d| d.bg(t.accent_soft).text_color(t.accent_text))
        .when(!selected, |d| {
            d.text_color(if danger { red } else { t.text_soft })
                .hover(|s| s.bg(t.hover))
        })
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            run(this, cx);
            close(this, cx);
        }))
        .child(icon(
            glyph,
            15.,
            if danger {
                red
            } else if selected {
                t.accent_text
            } else {
                t.muted
            },
        ))
        .child(SharedString::from(label.to_owned()))
        .into_any_element()
}

pub fn render(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Option<AnyElement> {
    let menu = app.menu.as_ref()?;
    let (id, pos, moving) = (menu.task_id.clone(), menu.pos, menu.moving);
    let Some(task) = app.snap.task(&id).cloned() else {
        app.menu = None;
        return None;
    };
    let tz = app.snap.tz.clone();
    let mut body = div().flex().flex_col().w(px(240.));
    if moving {
        body = body.child(heading("Move to", t)).child(
            div()
                .id("menu-move-list")
                .max_h(px(360.))
                .overflow_y_scroll()
                .child(edit::move_list(app, &id, t, cx, |this, _, cx| {
                    close(this, cx)
                })),
        );
    } else {
        let tid = id.clone();
        body = body.child(item(
            "toggle",
            "circle-check-big",
            if task.is_completed {
                "Reopen task"
            } else {
                "Complete task"
            },
            (false, false),
            t,
            cx,
            move |this, cx| this.toggle(&tid, cx),
        ));
        // Priority: one row of flags, the current one marked.
        let mut prios = div().flex().gap(px(4.)).px(px(4.)).pb(px(4.));
        for p in 1u8..=4 {
            let on = task.priority == p;
            let tid = id.clone();
            prios = prios.child(
                div()
                    .id(SharedString::from(format!("menu-p{p}")))
                    .flex_1()
                    .h(px(28.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .gap(px(4.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .text_size(ts(12.))
                    .when(on, |d| d.bg(t.accent_soft).text_color(t.accent_text))
                    .when(!on, |d| d.text_color(t.text_soft).hover(|s| s.bg(t.hover)))
                    .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                        edit::write(this, &tid, vec![("priority", Value::from(p))], cx);
                        close(this, cx);
                    }))
                    .child(icon("flag", 14., priority_color(p).unwrap_or(t.muted)))
                    .child(SharedString::from(if p < 4 {
                        format!("P{p}")
                    } else {
                        "None".to_owned()
                    })),
            );
        }
        body = body
            .child(rule(t))
            .child(heading("Priority", t))
            .child(prios)
            .child(rule(t))
            .child(heading("Due", t));
        let due_day = task.due_at.as_ref().map(|d| app.snap.date_of(ms(d)));
        for (label, day) in edit::quick_days(app.today) {
            let tid = id.clone();
            let tz = tz.clone();
            body = body.child(item(
                label,
                "calendar-days",
                label,
                (due_day == Some(day), false),
                t,
                cx,
                move |this, cx| {
                    if let Some(at) = edit::end_of_day(day, &tz) {
                        edit::write(this, &tid, vec![("due_at", Value::from(at))], cx);
                    }
                },
            ));
        }
        let tid = id.clone();
        body = body
            .child(item(
                "no-date",
                "x",
                "No date",
                (due_day.is_none(), false),
                t,
                cx,
                move |this, cx| edit::write(this, &tid, vec![("due_at", Value::Null)], cx),
            ))
            .child(rule(t))
            .child(
                div()
                    .id("menu-move")
                    .h(px(32.))
                    .px(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .text_size(ts(14.))
                    .text_color(t.text_soft)
                    .hover(|s| s.bg(t.hover))
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        if let Some(m) = this.menu.as_mut() {
                            m.moving = true;
                        }
                        cx.notify();
                    }))
                    .child(icon("folder-input", 15., t.muted))
                    .child(div().flex_1().child("Move to..."))
                    .child(icon("chevron-right", 14., t.faint)),
            );
        let (dup, del) = (id.clone(), id.clone());
        body = body
            .child(item(
                "duplicate",
                "copy-plus",
                "Duplicate",
                (false, false),
                t,
                cx,
                move |this, cx| edit::duplicate(this, &dup, cx),
            ))
            .child(item(
                "delete",
                "trash",
                "Delete",
                (false, true),
                t,
                cx,
                move |this, cx| edit::delete(this, &del, cx),
            ));
    }
    let panel = edit::panel(t)
        .id("task-menu")
        .occlude()
        .on_mouse_down_out(cx.listener(|this, _: &MouseDownEvent, _, cx| close(this, cx)))
        .child(body);
    let key = format!(
        "menu-in-{}-{}-{}-{moving}",
        id,
        f32::from(pos.x) as i32,
        f32::from(pos.y) as i32
    );
    let panel = motion::enter(panel, SharedString::from(key), 160, |el, v| {
        el.opacity(v).mt(px((1. - v) * -6.))
    });
    Some(
        deferred(
            anchored()
                .position(pos + point(px(2.), px(2.)))
                .snap_to_window_with_margin(px(8.))
                .child(panel),
        )
        .with_priority(2)
        .into_any_element(),
    )
}
