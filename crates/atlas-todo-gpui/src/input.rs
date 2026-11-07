//! A one-line text field, trimmed from GPUI's `examples/input.rs` (Apache-2.0): typing through the
//! platform input handler (so IME works), cursor, selection, clipboard. Enter emits [`Submit`].

use std::ops::Range;

use gpui::{
    actions, div, fill, point, prelude::*, px, relative, size, App, Bounds, ClipboardItem, Context,
    CursorStyle, ElementId, ElementInputHandler, EntityInputHandler, EventEmitter, FocusHandle,
    Focusable, GlobalElementId, Hsla, KeyBinding, LayoutId, MouseButton, MouseDownEvent, PaintQuad,
    Pixels, ShapedLine, SharedString, Style, TextRun, UTF16Selection, Window,
};
use unicode_segmentation::UnicodeSegmentation;

const BULLET: char = '•';

actions!(
    text_input,
    [Backspace, Delete, Left, Right, SelectAll, Home, End, Paste, Copy, Cut, Enter, Escape]
);

pub fn bind_keys(cx: &mut App) {
    let ctx = Some("TextInput");
    cx.bind_keys([
        KeyBinding::new("backspace", Backspace, ctx),
        KeyBinding::new("delete", Delete, ctx),
        KeyBinding::new("left", Left, ctx),
        KeyBinding::new("right", Right, ctx),
        KeyBinding::new("ctrl-a", SelectAll, ctx),
        KeyBinding::new("home", Home, ctx),
        KeyBinding::new("end", End, ctx),
        KeyBinding::new("ctrl-v", Paste, ctx),
        KeyBinding::new("ctrl-c", Copy, ctx),
        KeyBinding::new("ctrl-x", Cut, ctx),
        KeyBinding::new("enter", Enter, ctx),
        KeyBinding::new("escape", Escape, ctx),
    ]);
}

/// Enter was pressed with this text.
pub struct Submit(pub String);
/// Escape was pressed.
pub struct Cancel;
/// The text changed by typing, pasting or cutting (not by [`TextInput::set_text`] / `clear`).
pub struct Changed;

pub struct TextInput {
    focus_handle: FocusHandle,
    content: SharedString,
    placeholder: SharedString,
    selected: Range<usize>,
    marked: Option<Range<usize>>,
    last_layout: Option<ShapedLine>,
    last_bounds: Option<Bounds<Pixels>>,
    pub placeholder_color: Option<Hsla>,
    /// A password: drawn as bullets, never copied.
    pub masked: bool,
    /// A byte range of the text drawn on a tinted box (quick add's recognised date).
    pub highlight: Option<(Range<usize>, Hsla)>,
}

impl EventEmitter<Submit> for TextInput {}
impl EventEmitter<Cancel> for TextInput {}
impl EventEmitter<Changed> for TextInput {}

impl TextInput {
    pub fn new(placeholder: &str, cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            content: SharedString::default(),
            placeholder: SharedString::from(placeholder.to_owned()),
            selected: 0..0,
            marked: None,
            last_layout: None,
            last_bounds: None,
            placeholder_color: None,
            masked: false,
            highlight: None,
        }
    }

    pub fn set_text(&mut self, text: &str, cx: &mut Context<Self>) {
        self.content = SharedString::from(text.to_owned());
        self.selected = text.len()..text.len();
        cx.notify();
    }

    pub fn set_placeholder(&mut self, placeholder: &str, cx: &mut Context<Self>) {
        self.placeholder = SharedString::from(placeholder.to_owned());
        cx.notify();
    }

    pub fn text(&self) -> &str {
        &self.content
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.content = SharedString::default();
        self.selected = 0..0;
        self.marked = None;
        self.highlight = None;
        cx.notify();
    }

    /// `offset` within the text, on a character boundary.
    fn clamp(&self, offset: usize) -> usize {
        let mut o = offset.min(self.content.len());
        while !self.content.is_char_boundary(o) {
            o -= 1;
        }
        o
    }

    /// A range within the text (a stale one from the platform cannot point past it).
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

    fn select_all(&mut self, _: &SelectAll, _: &mut Window, cx: &mut Context<Self>) {
        self.selected = 0..self.content.len();
        cx.notify();
    }

    fn home(&mut self, _: &Home, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(0, cx);
    }

    fn end(&mut self, _: &End, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.content.len(), cx);
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

    fn paste(&mut self, _: &Paste, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(text) = cx.read_from_clipboard().and_then(|i| i.text()) {
            self.replace_text_in_range(None, &text.replace('\n', " "), window, cx);
        }
    }

    fn copy(&mut self, _: &Copy, _: &mut Window, cx: &mut Context<Self>) {
        if !self.selected.is_empty() && !self.masked {
            cx.write_to_clipboard(ClipboardItem::new_string(
                self.content[self.selected.clone()].to_string(),
            ));
        }
    }

    fn cut(&mut self, _: &Cut, window: &mut Window, cx: &mut Context<Self>) {
        if self.masked {
            return;
        }
        self.copy(&Copy, window, cx);
        self.replace_text_in_range(None, "", window, cx);
    }

    fn enter(&mut self, _: &Enter, _: &mut Window, cx: &mut Context<Self>) {
        cx.emit(Submit(self.content.to_string()));
    }

    fn escape(&mut self, _: &Escape, _: &mut Window, cx: &mut Context<Self>) {
        cx.emit(Cancel);
    }

    fn on_mouse_down(&mut self, ev: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        window.focus(&self.focus_handle, cx);
        let at = match (&self.last_bounds, &self.last_layout) {
            (Some(b), Some(l)) => {
                self.content_offset(l.closest_index_for_x(ev.position.x - b.left()))
            }
            _ => self.content.len(),
        };
        self.move_to(at, cx);
    }

    /// The offset in the drawn text of an offset in the content (they differ when masked).
    fn display_offset(&self, offset: usize) -> usize {
        if self.masked {
            self.content[..offset].chars().count() * BULLET.len_utf8()
        } else {
            offset
        }
    }

    fn content_offset(&self, offset: usize) -> usize {
        if !self.masked {
            return offset;
        }
        let n = offset / BULLET.len_utf8();
        self.content
            .char_indices()
            .nth(n)
            .map_or(self.content.len(), |(i, _)| i)
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

impl EntityInputHandler for TextInput {
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
        self.content = format!(
            "{}{}{}",
            &self.content[..r.start],
            text,
            &self.content[r.end..]
        )
        .into();
        self.selected = r.start + text.len()..r.start + text.len();
        self.marked = None;
        cx.emit(Changed);
        cx.notify();
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _: Option<Range<usize>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let r = range
            .as_ref()
            .map(|r| self.range_from_utf16(r))
            .or(self.marked.clone())
            .unwrap_or(self.selected.clone());
        let r = self.clamp_range(&r);
        self.marked = None;
        self.selected = r.clone();
        self.replace_text_in_range(None, "", window, cx);
        self.content = format!(
            "{}{}{}",
            &self.content[..r.start],
            text,
            &self.content[r.start..]
        )
        .into();
        self.marked = (!text.is_empty()).then(|| r.start..r.start + text.len());
        self.selected = r.start + text.len()..r.start + text.len();
        cx.emit(Changed);
        cx.notify();
    }

    fn bounds_for_range(
        &mut self,
        range: Range<usize>,
        bounds: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let layout = self.last_layout.as_ref()?;
        let r = self.range_from_utf16(&range);
        Some(Bounds::from_corners(
            point(bounds.left() + layout.x_for_index(r.start), bounds.top()),
            point(bounds.left() + layout.x_for_index(r.end), bounds.bottom()),
        ))
    }

    fn character_index_for_point(
        &mut self,
        p: gpui::Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        let local = self.last_bounds?.localize(&p)?;
        let i = self.last_layout.as_ref()?.closest_index_for_x(local.x);
        Some(self.utf8_to_utf16(i))
    }
}

struct TextElement {
    input: gpui::Entity<TextInput>,
}

struct Prepaint {
    line: Option<ShapedLine>,
    cursor: Option<PaintQuad>,
    selection: Option<PaintQuad>,
}

impl IntoElement for TextElement {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}

impl Element for TextElement {
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
        style.size.height = window.line_height().into();
        (window.request_layout(style, [], cx), ())
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
        let input = self.input.read(cx);
        let style = window.text_style();
        let (text, color) = if input.content.is_empty() {
            (
                input.placeholder.clone(),
                input.placeholder_color.unwrap_or(style.color.opacity(0.45)),
            )
        } else if input.masked {
            (
                SharedString::from(BULLET.to_string().repeat(input.content.chars().count())),
                style.color,
            )
        } else {
            (input.content.clone(), style.color)
        };
        let run = |len: usize, background_color: Option<Hsla>| TextRun {
            len,
            font: style.font(),
            color,
            background_color,
            underline: None,
            strikethrough: None,
        };
        let highlight = input
            .highlight
            .clone()
            .filter(|_| !input.content.is_empty() && !input.masked)
            .map(|(r, c)| (input.clamp_range(&r), c))
            .filter(|(r, _)| !r.is_empty());
        let runs = match highlight {
            Some((r, c)) => [
                run(r.start, None),
                run(r.len(), Some(c)),
                run(text.len() - r.end, None),
            ]
            .into_iter()
            .filter(|r| r.len > 0)
            .collect(),
            None => vec![run(text.len(), None)],
        };
        let font_size = style.font_size.to_pixels(window.rem_size());
        let line = window
            .text_system()
            .shape_line(text, font_size, &runs, None);
        let sel = input.selected.clone();
        let (selection, cursor) = if sel.is_empty() {
            let x = if input.content.is_empty() {
                px(0.)
            } else {
                line.x_for_index(input.display_offset(sel.start))
            };
            (
                None,
                Some(fill(
                    Bounds::new(
                        point(bounds.left() + x, bounds.top()),
                        size(px(1.5), bounds.size.height),
                    ),
                    style.color,
                )),
            )
        } else {
            (
                Some(fill(
                    Bounds::from_corners(
                        point(
                            bounds.left() + line.x_for_index(input.display_offset(sel.start)),
                            bounds.top(),
                        ),
                        point(
                            bounds.left() + line.x_for_index(input.display_offset(sel.end)),
                            bounds.bottom(),
                        ),
                    ),
                    gpui::rgba(0x6366f140),
                )),
                None,
            )
        };
        Prepaint {
            line: Some(line),
            cursor,
            selection,
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
        if let Some(s) = pre.selection.take() {
            window.paint_quad(s);
        }
        let line = pre.line.take().expect("prepaint shaped the line");
        // The highlight's box, under the text.
        let _ = line.paint_background(
            bounds.origin,
            window.line_height(),
            gpui::TextAlign::Left,
            None,
            window,
            cx,
        );
        let _ = line.paint(
            bounds.origin,
            window.line_height(),
            gpui::TextAlign::Left,
            None,
            window,
            cx,
        );
        if focus.is_focused(window) {
            if let Some(c) = pre.cursor.take() {
                window.paint_quad(c);
            }
        }
        self.input.update(cx, |i, _| {
            i.last_layout = Some(line);
            i.last_bounds = Some(bounds);
        });
    }
}

impl Render for TextInput {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .w_full()
            .key_context("TextInput")
            .track_focus(&self.focus_handle)
            .cursor(CursorStyle::IBeam)
            .on_action(cx.listener(Self::backspace))
            .on_action(cx.listener(Self::delete))
            .on_action(cx.listener(Self::left))
            .on_action(cx.listener(Self::right))
            .on_action(cx.listener(Self::select_all))
            .on_action(cx.listener(Self::home))
            .on_action(cx.listener(Self::end))
            .on_action(cx.listener(Self::paste))
            .on_action(cx.listener(Self::copy))
            .on_action(cx.listener(Self::cut))
            .on_action(cx.listener(Self::enter))
            .on_action(cx.listener(Self::escape))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_mouse_down))
            .child(TextElement { input: cx.entity() })
    }
}

impl Focusable for TextInput {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}
