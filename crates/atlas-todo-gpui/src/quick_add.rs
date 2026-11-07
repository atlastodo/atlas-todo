//! Quick add's preview (`QuickAdd.tsx`): as the add field is typed in, the text goes through the
//! shared `parse_quick_add` and a row of chips under the field shows what the task will get: its
//! date, priority, project, labels and repeat. The recognised date phrase is boxed in the field.

use gpui::{div, prelude::*, px, rgb, AnyElement, Context, FontWeight, Rgba, SharedString};

use atlas_todo_rules::rules::quick_add::{parse_quick_add, QuickAddContext, QuickAddResult};
use atlas_todo_rules::rules::recurrence::{parse_rule, Freq, RecurMode};

use crate::app::{AddTarget, AtlasApp};
use crate::format;
use crate::theme::Theme;
use crate::ui::{icon, ts};

/// A chip's kind, each with its tint (`chips.ts`).
#[derive(Clone, Copy)]
pub enum ChipKind {
    Due,
    Recurrence,
    Project,
    Label,
    Priority,
}

impl ChipKind {
    fn icon(self) -> &'static str {
        match self {
            ChipKind::Due => "calendar-days",
            ChipKind::Recurrence => "repeat",
            ChipKind::Project => "hash",
            ChipKind::Label => "tag",
            ChipKind::Priority => "flag",
        }
    }

    /// `(chip background, text)`: Tailwind's 100 / 700 shades, 950 / 300 in the dark.
    pub fn colors(self, dark: bool) -> (Rgba, Rgba) {
        let (light, night) = match self {
            ChipKind::Due => ((0xe0f2fe, 0x0369a1), (0x082f49, 0x7dd3fc)),
            ChipKind::Recurrence => ((0xede9fe, 0x6d28d9), (0x2e1065, 0xc4b5fd)),
            ChipKind::Project => ((0xfae8ff, 0xa21caf), (0x4a044e, 0xf0abfc)),
            ChipKind::Label => ((0xd1fae5, 0x047857), (0x022c22, 0x6ee7b7)),
            ChipKind::Priority => ((0xffe4e6, 0xbe123c), (0x4c0519, 0xfda4af)),
        };
        let (bg, fg) = if dark { night } else { light };
        (rgb(bg), rgb(fg))
    }
}

/// The box behind the recognised date in the field (`chipColors("due").box`: sky 100 / 900).
pub fn date_box(dark: bool) -> Rgba {
    rgb(if dark { 0x0c4a6e } else { 0xe0f2fe })
}

/// `text` parsed as quick add does on submit (`TodoClient::quick_add`): `#project` and `@label`
/// against the account's names.
pub fn parse(app: &AtlasApp, text: &str) -> QuickAddResult {
    let snap = &app.snap;
    let by_name = |name: &str| -> Option<String> {
        snap.projects
            .iter()
            .find(|p| p.name.to_lowercase() == name.to_lowercase())
            .map(|p| p.id.clone())
    };
    let known = |name: &str| {
        snap.labels
            .iter()
            .any(|l| l.name.to_lowercase() == name.to_lowercase())
    };
    let ctx = QuickAddContext {
        project_id_by_name: Some(&by_name),
        is_known_label: Some(&known),
        language: app.pref("language").and_then(|v| v.as_str()),
        ..QuickAddContext::default()
    };
    parse_quick_add(text, crate::now_ms(), &snap.tz, &ctx)
}

/// The byte range of a UTF-16 span of `text` (the parser counts as JavaScript does).
fn utf8_range(text: &str, start: usize, end: usize) -> std::ops::Range<usize> {
    let (mut u16i, mut a, mut b) = (0, text.len(), text.len());
    for (i, ch) in text.char_indices() {
        if u16i == start {
            a = i;
        }
        if u16i == end {
            b = i;
            break;
        }
        u16i += ch.len_utf16();
    }
    a.min(b)..b
}

impl AtlasApp {
    /// The add field changed: box the date phrase it now carries, and redraw the chips.
    pub fn quick_add_changed(&mut self, cx: &mut Context<Self>) {
        let text = self.input.read(cx).text().to_owned();
        let parsed = parse(self, &text);
        let dark = self.theme_dark;
        let highlight = parsed
            .date_match
            .map(|m| (utf8_range(&text, m.start, m.end), date_box(dark).into()));
        self.input.update(cx, |i, cx| {
            i.highlight = highlight;
            cx.notify();
        });
        cx.notify();
    }
}

/// "Every 2 weeks on Mon, Wed" (`formatRule`, in English).
pub fn summarize_rule(rule: &str) -> Option<String> {
    let r = parse_rule(rule)?;
    let (one, unit) = match r.freq {
        Freq::Daily => ("Every day", "days"),
        Freq::Weekly => ("Every week", "weeks"),
        Freq::Monthly => ("Every month", "months"),
        Freq::Yearly => ("Every year", "years"),
    };
    let mut s = if r.interval == 1 {
        one.to_owned()
    } else {
        format!("Every {} {unit}", r.interval)
    };
    if r.freq == Freq::Weekly && !r.byday.is_empty() {
        const DAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        let days: Vec<&str> = r
            .byday
            .iter()
            .filter_map(|d| DAYS.get(*d as usize).copied())
            .collect();
        s = format!("{s} on {}", days.join(", "));
    }
    if r.freq == Freq::Monthly && r.mode == RecurMode::OnSchedule {
        if let Some(d) = r.bymonthday {
            s = format!("{s} on day {d}");
        }
    }
    if r.mode == RecurMode::AfterCompletion {
        s = format!("{s} (after completion)");
    }
    Some(s)
}

/// The due chip's text: "Today", "Tomorrow, 15:00", "8 Oct".
fn due_text(app: &AtlasApp, ms: i64) -> String {
    let snap = &app.snap;
    let day = snap.date_of(ms);
    let time = if format::is_all_day(ms, &snap.tz) {
        String::new()
    } else {
        format!(", {}", format::time(ms, &snap.tz))
    };
    if day == app.today {
        format!("Today{time}")
    } else if app.today.tomorrow().is_ok_and(|d| d == day) {
        format!("Tomorrow{time}")
    } else {
        format::due(ms, &snap.tz)
    }
}

fn chip(kind: ChipKind, text: String, t: &Theme) -> AnyElement {
    let (bg, fg) = kind.colors(t.dark);
    div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(6.))
        .px(px(10.))
        .py(px(4.))
        .rounded_full()
        .bg(bg)
        .text_size(ts(12.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(fg)
        .child(icon(kind.icon(), 13., fg))
        .child(SharedString::from(text))
        .into_any_element()
}

/// The chips for what the add field's text sets, under the field.
pub fn preview(
    app: &AtlasApp,
    target: &AddTarget,
    t: &Theme,
    cx: &Context<AtlasApp>,
) -> AnyElement {
    let text = app.input.read(cx).text().to_owned();
    let parsed = parse(app, &text);
    let snap = &app.snap;
    let mut chips: Vec<AnyElement> = Vec::new();
    if let Some(due) = parsed.due_at {
        chips.push(chip(ChipKind::Due, due_text(app, due), t));
    }
    if let Some(p) = parsed.priority.filter(|p| *p < 4) {
        chips.push(chip(ChipKind::Priority, format!("P{p}"), t));
    }
    // A typed `#project` wins over the list the field is in (and drops its section).
    let project = match &parsed.project_id {
        Some(id) => snap.project(id).map(|p| p.name.clone()),
        None => target.project_id.as_deref().and_then(|id| {
            let name = snap.project(id)?.name.clone();
            Some(
                match target.section_id.as_deref().and_then(|s| snap.section(s)) {
                    Some(s) => format!("{name} / {}", s.name),
                    None => name,
                },
            )
        }),
    };
    chips.push(chip(
        ChipKind::Project,
        project.unwrap_or_else(|| "Inbox".into()),
        t,
    ));
    if let Some(first) = parsed.labels.first() {
        let more = parsed.labels.len() - 1;
        let text = if more > 0 {
            format!("{first} +{more}")
        } else {
            first.clone()
        };
        chips.push(chip(ChipKind::Label, text, t));
    }
    if let Some(rule) = parsed.recurrence.as_deref().and_then(summarize_rule) {
        chips.push(chip(ChipKind::Recurrence, rule, t));
    }
    div()
        .flex()
        .flex_wrap()
        .items_center()
        .gap(px(6.))
        .children(chips)
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule_summaries() {
        assert_eq!(summarize_rule("FREQ=DAILY").as_deref(), Some("Every day"));
        assert_eq!(
            summarize_rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE").as_deref(),
            Some("Every 2 weeks on Mon, Wed")
        );
    }

    #[test]
    fn utf16_spans() {
        assert_eq!(utf8_range("ab tomorrow", 3, 11), 3..11);
        assert_eq!(utf8_range("é tomorrow", 2, 10), 3..11);
    }
}
