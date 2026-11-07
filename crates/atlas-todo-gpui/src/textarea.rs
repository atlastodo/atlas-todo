//! A multi-line text field (a task's notes): the one-line [`crate::input::TextInput`] grown to wrap
//! its text and take Enter as a new line. Typing goes through the platform input handler (IME),
//! with a cursor, a selection, the arrow keys and the clipboard. Its owner saves on blur.

use std::ops::Range;
use std::sync::atomic::{AtomicBool, Ordering};

use gpui::{
    actions, div, fill, point, prelude::*, px, relative, size, App, AvailableSpace, Bounds,
    ClipboardItem, Context, CursorStyle, ElementId, ElementInputHandler, EntityInputHandler,
    FocusHandle, Focusable, GlobalElementId, KeyBinding, LayoutId, MouseButton, MouseDownEvent,
    PaintQuad, Pixels, Point, SharedString, Style, TextRun, UTF16Selection, Window, WrappedLine,
};
use unicode_segmentation::UnicodeSegmentation;

actions!(
    text_area,
    [
        Backspace, Delete, Left, Right, Up, Down, SelectAll, Home, End, Paste, Copy, Cut, Newline,
        Escape
    ]
);

static BOUND: AtomicBool = AtomicBool::new(false);

/// The keys, bound the first time a field is made.
fn bind_keys(cx: &mut App) {
    if BOUND.swap(true, Ordering::Relaxed) {
        return;
    }
    let ctx = Some("TextArea");
    cx.bind_keys([
        KeyBinding::new("backspace", Backspace, ctx),
        KeyBinding::new("delete", Delete, ctx),
        KeyBinding::new("left", Left, ctx),
        KeyBinding::new("right", Right, ctx),
        KeyBinding::new("up", Up, ctx),
        KeyBinding::new("down", Down, ctx),
        KeyBinding::new("ctrl-a", SelectAll, ctx),
        KeyBinding::new("home", Home, ctx),
        KeyBinding::new("end", End, ctx),
        KeyBinding::new("ctrl-v", Paste, ctx),
        KeyBinding::new("ctrl-c", Copy, ctx),
        KeyBinding::new("ctrl-x", Cut, ctx),
        KeyBinding::new("enter", Newline, ctx),
        KeyBinding::new("shift-enter", Newline, ctx),
        KeyBinding::new("escape", Escape, ctx),
    ]);
}

/// The text as last drawn: each hard line with its byte offset and top.
#[derive(Default)]
struct Layout {
    lines: Vec<(usize, Pixels, WrappedLine)>,
    bounds: Option<Bounds<Pixels>>,
    line_height: Pixels,
}

pub struct TextArea {
    focus_handle: FocusHandle,
    content: String,
    placeholder: SharedString,
    selected: Range<usize>,
    marked: Option<Range<usize>>,
    layout: Layout,
}

impl TextArea {
    pub fn new(placeholder: &str, cx: &mut Context<Self>) -> Self {
        bind_keys(cx);
        Self {
            focus_handle: cx.focus_handle(),
            content: String::new(),
            placeholder: SharedString::from(placeholder.to_owned()),
            selected: 0..0,
            marked: None,
            layout: Layout::default(),
        }
    }

    pub fn set_text(&mut self, text: &str, cx: &mut Context<Self>) {
        self.content = text.to_owned();
        self.selected = text.len()..text.len();
        self.marked = None;
        cx.notify();
    }

    pub fn text(&self) -> &str {
        &self.content
    }

    fn clamp(&self, offset: usize) -> usize {
        let mut o = offset.min(self.content.len());
        while !self.content.is_char_boundary(o) {
            o -= 1;
        }
        o
    }

    fn clamp_range(&self, r: &Range<usize>) -> Range<usize> {
        let end = self.clamp(r.end);
        self.clamp(r.start.min(end))..end
    }

    fn move_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        let offset = self.clamp(offset);
        self.selected = offset..offset;
        cx.notify();
    }

    fn prev(&self, offset: usize) -> usize {
        self.content
            .grapheme_indices(true)
            .rev()
            .find_map(|(i, _)| (i < offset).then_some(i))
            .unwrap_or(0)
    }

    fn next(&self, offset: usize) -> usize {
        self.content
            .grapheme_indices(true)
            .find_map(|(i, _)| (i > offset).then_some(i))
            .unwrap_or(self.content.len())
    }

    /// Where `offset` is drawn, relative to the field's top left.
    fn position_of(&self, offset: usize) -> Option<Point<Pixels>> {
        let lh = self.layout.line_height;
        let (start, top, line) = self
            .layout
            .lines
            .iter()
            .rev()
            .find(|(start, _, _)| *start <= offset)?;
        let p = line.position_for_index(offset - start, lh)?;
        Some(point(p.x, *top + p.y))
    }

    /// The offset closest to a point relative to the field's top left.
    fn offset_at(&self, p: Point<Pixels>) -> usize {
        let lh = self.layout.line_height;
        let Some((start, top, line)) = self
            .layout
            .lines
            .iter()
            .rev()
            .find(|(_, top, _)| *top <= p.y)
            .or(self.layout.lines.first())
        else {
            return self.content.len();
        };
        let local = point(p.x.max(px(0.)), (p.y - *top).max(px(0.)));
        let i = match line.closest_index_for_position(local, lh) {
            Ok(i) | Err(i) => i,
        };
        start + i.min(line.len())
    }

    fn vertical(&mut self, rows: f32, cx: &mut Context<Self>) {
        let lh = self.layout.line_height;
        let Some(p) = self.position_of(self.selected.end) else {
            return;
        };
        let to = if rows < 0. && p.y < lh * 0.5 {
            0
        } else {
            self.offset_at(point(p.x, p.y + lh * rows + lh * 0.5))
        };
        self.move_to(to, cx);
    }

    fn left(&mut self, _: &Left, _: &mut Window, cx: &mut Context<Self>) {
        let to = if self.selected.is_empty() {
            self.prev(self.selected.start)
        } else {
            self.selected.start
        };
        self.move_to(to, cx);
    }

    fn right(&mut self, _: &Right, _: &mut Window, cx: &mut Context<Self>) {
        let to = if self.selected.is_empty() {
            self.next(self.selected.end)
        } else {
            self.selected.end
        };
        self.move_to(to, cx);
    }

    fn up(&mut self, _: &Up, _: &mut Window, cx: &mut Context<Self>) {
        self.vertical(-1., cx);
    }

    fn down(&mut self, _: &Down, _: &mut Window, cx: &mut Context<Self>) {
        self.vertical(1., cx);
    }

    fn select_all(&mut self, _: &SelectAll, _: &mut Window, cx: &mut Context<Self>) {
        self.selected = 0..self.content.len();
        cx.notify();
    }

    /// The start of the cursor's hard line.
    fn home(&mut self, _: &Home, _: &mut Window, cx: &mut Context<Self>) {
        let at = self.content[..self.selected.start]
            .rfind('\n')
            .map_or(0, |i| i + 1);
        self.move_to(at, cx);
    }

    fn end(&mut self, _: &End, _: &mut Window, cx: &mut Context<Self>) {
        let from = self.selected.end;
        let at = self.content[from..]
            .find('\n')
            .map_or(self.content.len(), |i| from + i);
        self.move_to(at, cx);
    }

    fn backspace(&mut self, _: &Backspace, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected.is_empty() {
            self.selected = self.prev(self.selected.start)..self.selected.end;
        }
        self.replace_text_in_range(None, "", window, cx);
    }

    fn delete(&mut self, _: &Delete, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected.is_empty() {
            self.selected = self.selected.start..self.next(self.selected.end);
        }
        self.replace_text_in_range(None, "", window, cx);
    }

    fn newline(&mut self, _: &Newline, window: &mut Window, cx: &mut Context<Self>) {
        self.replace_text_in_range(None, "\n", window, cx);
    }

    fn escape(&mut self, _: &Escape, window: &mut Window, cx: &mut Context<Self>) {
        // Leaving the field saves it (its owner listens for the blur).
        window.blur(cx);
    }

    fn paste(&mut self, _: &Paste, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(text) = cx.read_from_clipboard().and_then(|i| i.text()) {
            self.replace_text_in_range(None, &text.replace("\r\n", "\n"), window, cx);
        }
    }

    fn copy(&mut self, _: &Copy, _: &mut Window, cx: &mut Context<Self>) {
        if !self.selected.is_empty() {
            cx.write_to_clipboard(ClipboardItem::new_string(
                self.content[self.selected.clone()].to_string(),
            ));
        }
    }

    fn cut(&mut self, _: &Cut, window: &mut Window, cx: &mut Context<Self>) {
        self.copy(&Copy, window, cx);
        self.replace_text_in_range(None, "", window, cx);
    }

    fn on_mouse_down(&mut self, ev: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        window.focus(&self.focus_handle, cx);
        let at = match self.layout.bounds {
            Some(b) if !self.content.is_empty() => self.offset_at(ev.position - b.origin),
            _ => self.content.len(),
        };
        self.move_to(at, cx);
    }

    fn utf16_to_utf8(&self, offset: usize) -> usize {
        let (mut u8i, mut u16i) = (0, 0);
        for ch in self.content.chars() {
            if u16i >= offset {
                break;
            }
            u16i += ch.len_utf16();
            u8i += ch.len_utf8();
        }
        u8i
    }

    fn utf8_to_utf16(&self, offset: usize) -> usize {
        let (mut u8i, mut u16i) = (0, 0);
        for ch in self.content.chars() {
            if u8i >= offset {
                break;
            }
            u8i += ch.len_utf8();
            u16i += ch.len_utf16();
        }
        u16i
    }

    fn range_from_utf16(&self, r: &Range<usize>) -> Range<usize> {
        self.utf16_to_utf8(r.start)..self.utf16_to_utf8(r.end)
    }

    fn range_to_utf16(&self, r: &Range<usize>) -> Range<usize> {
        self.utf8_to_utf16(r.start)..self.utf8_to_utf16(r.end)
    }
}

impl EntityInputHandler for TextArea {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        actual: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let r = self.clamp_range(&self.range_from_utf16(&range));
        actual.replace(self.range_to_utf16(&r));
        Some(self.content[r].to_string())
    }

    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.range_to_utf16(&self.selected),
            reversed: false,
        })
    }

    fn set_selected_text_range(&mut self, r: Range<usize>, _: &mut Window, cx: &mut Context<Self>) {
        self.selected = self.clamp_range(&self.range_from_utf16(&r));
        cx.notify();
    }

    fn text_length_utf16(&mut self, _: &mut Window, _: &mut Context<Self>) -> Option<usize> {
        Some(self.content.encode_utf16().count())
    }

    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked.as_ref().map(|r| self.range_to_utf16(r))
    }

    fn unmark_text(&mut self, _: &mut Window, _: &mut Context<Self>) {
        self.marked = None;
    }

    fn replace_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let r = range
            .as_ref()
            .map(|r| self.range_from_utf16(r))
            .or(self.marked.clone())
            .unwrap_or(self.selected.clone());
        let r = self.clamp_range(&r);
        self.content.replace_range(r.clone(), text);
        self.selected = r.start + text.len()..r.start + text.len();
        self.marked = None;
        cx.notify();
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _: Option<Range<usize>>,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let r = range
            .as_ref()
            .map(|r| self.range_from_utf16(r))
            .or(self.marked.clone())
            .unwrap_or(self.selected.clone());
        let r = self.clamp_range(&r);
        self.content.replace_range(r.clone(), text);
        self.marked = (!text.is_empty()).then(|| r.start..r.start + text.len());
        self.selected = r.start + text.len()..r.start + text.len();
        cx.notify();
    }

    fn bounds_for_range(
        &mut self,
        range: Range<usize>,
        bounds: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let r = self.range_from_utf16(&range);
        let a = self.position_of(r.start)?;
        let lh = self.layout.line_height;
        Some(Bounds::new(bounds.origin + a, size(px(2.), lh)))
    }

    fn character_index_for_point(
        &mut self,
        p: Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        let b = self.layout.bounds?;
        Some(self.utf8_to_utf16(self.offset_at(p - b.origin)))
    }
}

struct AreaElement {
    input: gpui::Entity<TextArea>,
}

struct Prepaint {
    lines: Vec<(usize, Pixels, WrappedLine)>,
    quads: Vec<PaintQuad>,
    cursor: Option<PaintQuad>,
}

impl IntoElement for AreaElement {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}

/// The shown text (the placeholder when empty) and its run.
fn shown(input: &TextArea, window: &Window) -> (SharedString, TextRun, Pixels) {
    let style = window.text_style();
    let (text, color) = if input.content.is_empty() {
        (input.placeholder.clone(), style.color.opacity(0.45))
    } else {
        (SharedString::from(input.content.clone()), style.color)
    };
    let run = TextRun {
        len: text.len(),
        font: style.font(),
        color,
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    (text, run, style.font_size.to_pixels(window.rem_size()))
}

fn shape(
    text: SharedString,
    run: &TextRun,
    font_size: Pixels,
    width: Pixels,
    line_height: Pixels,
    window: &Window,
) -> Vec<(usize, Pixels, WrappedLine)> {
    let lines = window
        .text_system()
        .shape_text(
            text,
            font_size,
            std::slice::from_ref(run),
            Some(width),
            None,
        )
        .unwrap_or_default();
    let (mut start, mut top) = (0, px(0.));
    lines
        .into_iter()
        .map(|l| {
            let at = (start, top, l);
            start += at.2.len() + 1;
            top += line_height * (at.2.wrap_boundaries.len() + 1) as f32;
            at
        })
        .collect()
}

impl Element for AreaElement {
    type RequestLayoutState = ();
    type PrepaintState = Prepaint;

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        let (text, run, font_size) = shown(self.input.read(cx), window);
        let line_height = window.line_height();
        let id = window.request_measured_layout(style, move |known, available, window, _| {
            let width = known.width.unwrap_or(match available.width {
                AvailableSpace::Definite(w) => w,
                _ => px(10_000.),
            });
            let lines = shape(text.clone(), &run, font_size, width, line_height, window);
            let rows: usize = lines
                .iter()
                .map(|(_, _, l)| l.wrap_boundaries.len() + 1)
                .sum();
            size(width, line_height * rows.max(1) as f32)
        });
        (id, ())
    }

    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) -> Prepaint {
        let line_height = window.line_height();
        let (text, run, font_size) = shown(self.input.read(cx), window);
        let lines = shape(
            text,
            &run,
            font_size,
            bounds.size.width,
            line_height,
            window,
        );
        let color = window.text_style().color;
        let input = self.input.read(cx);
        let empty = input.content.is_empty();
        let sel = input.selected.clone();
        // Positions within the fresh lines.
        let pos = |offset: usize| -> Point<Pixels> {
            lines
                .iter()
                .rev()
                .find(|(start, _, _)| *start <= offset)
                .and_then(|(start, top, l)| {
                    l.position_for_index(offset - start, line_height)
                        .map(|p| point(p.x, *top + p.y))
                })
                .unwrap_or_default()
        };
        let mut quads = Vec::new();
        let mut cursor = None;
        if sel.is_empty() || empty {
            let p = if empty {
                point(px(0.), px(0.))
            } else {
                pos(sel.start)
            };
            cursor = Some(fill(
                Bounds::new(bounds.origin + p, size(px(1.5), line_height)),
                color,
            ));
        } else {
            let (a, b) = (pos(sel.start), pos(sel.end));
            let tint = gpui::rgba(0x6366f140);
            let row = |y: Pixels, x0: Pixels, x1: Pixels| {
                fill(
                    Bounds::from_corners(
                        bounds.origin + point(x0, y),
                        bounds.origin + point(x1, y + line_height),
                    ),
                    tint,
                )
            };
            if a.y == b.y {
                quads.push(row(a.y, a.x, b.x));
            } else {
                quads.push(row(a.y, a.x, bounds.size.width));
                let mut y = a.y + line_height;
                while y < b.y {
                    quads.push(row(y, px(0.), bounds.size.width));
                    y += line_height;
                }
                quads.push(row(b.y, px(0.), b.x));
            }
        }
        Prepaint {
            lines,
            quads,
            cursor,
        }
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        pre: &mut Prepaint,
        window: &mut Window,
        cx: &mut App,
    ) {
        let focus = self.input.read(cx).focus_handle.clone();
        window.handle_input(
            &focus,
            ElementInputHandler::new(bounds, self.input.clone()),
            cx,
        );
        for q in pre.quads.drain(..) {
            window.paint_quad(q);
        }
        let line_height = window.line_height();
        for (_, top, line) in &pre.lines {
            let _ = line.paint(
                bounds.origin + point(px(0.), *top),
                line_height,
                gpui::TextAlign::Left,
                Some(bounds),
                window,
                cx,
            );
        }
        if focus.is_focused(window) {
            if let Some(c) = pre.cursor.take() {
                window.paint_quad(c);
            }
        }
        let lines = std::mem::take(&mut pre.lines);
        self.input.update(cx, |i, _| {
            i.layout = Layout {
                lines,
                bounds: Some(bounds),
                line_height,
            };
        });
    }
}

impl Render for TextArea {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .w_full()
            .key_context("TextArea")
            .track_focus(&self.focus_handle)
            .cursor(CursorStyle::IBeam)
            .on_action(cx.listener(Self::backspace))
            .on_action(cx.listener(Self::delete))
            .on_action(cx.listener(Self::left))
            .on_action(cx.listener(Self::right))
            .on_action(cx.listener(Self::up))
            .on_action(cx.listener(Self::down))
            .on_action(cx.listener(Self::select_all))
            .on_action(cx.listener(Self::home))
            .on_action(cx.listener(Self::end))
            .on_action(cx.listener(Self::paste))
            .on_action(cx.listener(Self::copy))
            .on_action(cx.listener(Self::cut))
            .on_action(cx.listener(Self::newline))
            .on_action(cx.listener(Self::escape))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_mouse_down))
            .child(AreaElement { input: cx.entity() })
    }
}

impl Focusable for TextArea {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}
