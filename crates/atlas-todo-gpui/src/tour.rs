//! `ATLAS_GPUI_TOUR=1`: walk through the screens and their transitions on a timer, through the same
//! handlers clicks use, to record the motion. It completes a task and checks in a habit, then puts
//! both back; run it on a throwaway account.

use std::time::Duration;

use gpui::{Context, WeakEntity};

use crate::app::{AtlasApp, Route};

type Action = Box<dyn Fn(&mut AtlasApp, &mut Context<AtlasApp>)>;
type Step = (u64, Action);

fn project(app: &AtlasApp, name: &str) -> Option<String> {
    app.snap
        .projects
        .iter()
        .find(|p| p.name == name)
        .map(|p| p.id.clone())
}

fn task(app: &AtlasApp, title: &str) -> Option<String> {
    app.snap
        .tasks
        .iter()
        .find(|t| t.title == title)
        .map(|t| t.id.clone())
}

fn steps() -> Vec<Step> {
    let go = |r: Route| -> Action { Box::new(move |a, cx| a.go(r.clone(), cx)) };
    vec![
        (1200, go(Route::Upcoming)),
        (
            1400,
            Box::new(|a, cx| {
                if let Some(p) = project(a, "Website relaunch") {
                    a.set_board(&p, false);
                    a.go(Route::Project(p), cx);
                }
            }),
        ),
        (
            1300,
            Box::new(|a, cx| {
                if let Some(s) = a.snap.sections.first().map(|s| s.id.clone()) {
                    a.collapsed.insert(s);
                    cx.notify();
                }
            }),
        ),
        (
            900,
            Box::new(|a, cx| {
                a.collapsed.clear();
                cx.notify();
            }),
        ),
        (
            1200,
            Box::new(|a, cx| {
                if let Some(t) = task(a, "Hero illustration") {
                    a.toggle(&t, cx);
                }
            }),
        ),
        (
            1800,
            Box::new(|a, cx| {
                if let Some(p) = project(a, "Website relaunch") {
                    a.set_board(&p, true);
                    cx.notify();
                }
            }),
        ),
        (
            1500,
            Box::new(|a, cx| {
                a.open_task = task(a, "Review mobile mockups with the team");
                cx.notify();
            }),
        ),
        (
            1800,
            Box::new(|a, cx| {
                a.open_task = None;
                cx.notify();
            }),
        ),
        (
            900,
            Box::new(|a, cx| {
                if let Some(p) = project(a, "Website relaunch") {
                    a.set_board(&p, false);
                    cx.notify();
                }
            }),
        ),
        (1300, go(Route::Calendar)),
        (1400, go(Route::Habits)),
        (
            1100,
            Box::new(|a, cx| {
                if let Some(h) = a.snap.habits.last().map(|h| h.id.clone()) {
                    crate::habits::toggle_today(a, &h, a.today);
                    cx.notify();
                }
            }),
        ),
        (1500, go(Route::Stats)),
        (2000, go(Route::Today)),
        // Put back what the tour changed.
        (
            200,
            Box::new(|a, cx| {
                if let Some(t) = task(a, "Hero illustration") {
                    a.toggle(&t, cx);
                }
                if let Some(h) = a.snap.habits.last().map(|h| h.id.clone()) {
                    crate::habits::toggle_today(a, &h, a.today);
                    cx.notify();
                }
            }),
        ),
    ]
}

pub fn start(cx: &mut Context<AtlasApp>) {
    cx.spawn(async move |this: WeakEntity<AtlasApp>, cx| {
        // Wait for the first sync.
        loop {
            cx.background_executor()
                .timer(Duration::from_millis(300))
                .await;
            let ready = this
                .update(cx, |a, _| !a.snap.projects.is_empty())
                .unwrap_or(false);
            if ready {
                break;
            }
        }
        cx.background_executor()
            .timer(Duration::from_millis(1500))
            .await;
        for (wait, step) in steps() {
            if this.update(cx, |a, cx| step(a, cx)).is_err() {
                return;
            }
            cx.background_executor()
                .timer(Duration::from_millis(wait))
                .await;
        }
    })
    .detach();
}
