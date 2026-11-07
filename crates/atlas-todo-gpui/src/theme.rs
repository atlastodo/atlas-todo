//! The web app's colours: Tailwind's neutral scale and the accent presets
//! (`packages/todo-core/src/theme.ts`), for light and dark.

use gpui::{rgb, rgba, Rgba};

#[derive(Clone, Copy)]
pub struct Theme {
    pub dark: bool,
    pub bg: Rgba,
    pub sidebar: Rgba,
    pub surface: Rgba,
    pub border: Rgba,
    pub divider: Rgba,
    pub text: Rgba,
    pub text_soft: Rgba,
    pub muted: Rgba,
    pub faint: Rgba,
    pub hover: Rgba,
    pub selected: Rgba,
    pub selected_text: Rgba,
    pub chip: Rgba,
    pub accent: Rgba,
    pub accent_soft: Rgba,
    pub accent_text: Rgba,
    pub on_accent: Rgba,
    pub overlay: Rgba,
    pub circle: Rgba,
    pub track: Rgba,
    pub cell_off: Rgba,
}

pub const RED: u32 = 0xef4444;
pub const ORANGE: u32 = 0xf97316;
pub const BLUE: u32 = 0x3b82f6;
pub const EMERALD: u32 = 0x10b981;
pub const FLAME: u32 = 0xf97316;

impl Theme {
    pub fn light() -> Self {
        Self {
            dark: false,
            bg: rgb(0xffffff),
            sidebar: rgb(0xffffff),
            surface: rgb(0xffffff),
            border: rgb(0xe5e5e5),
            divider: rgb(0xf5f5f5),
            text: rgb(0x171717),
            text_soft: rgb(0x404040),
            muted: rgb(0x737373),
            faint: rgb(0xa3a3a3),
            hover: rgb(0xfafafa),
            selected: rgb(0xf5f5f5),
            selected_text: rgb(0x4338ca),
            chip: rgb(0xf5f5f5),
            accent: rgb(0x4f46e5),
            accent_soft: rgb(0xeef2ff),
            accent_text: rgb(0x4f46e5),
            on_accent: rgb(0xffffff),
            overlay: rgba(0x00000080),
            circle: rgb(0xa3a3a3),
            track: rgb(0xf5f5f5),
            cell_off: rgb(0xd4d4d4),
        }
    }

    pub fn dark() -> Self {
        Self {
            dark: true,
            bg: rgb(0x0a0a0a),
            sidebar: rgb(0x0a0a0a),
            surface: rgb(0x171717),
            border: rgb(0x262626),
            divider: rgb(0x1f1f1f),
            text: rgb(0xfafafa),
            text_soft: rgb(0xe5e5e5),
            muted: rgb(0xa3a3a3),
            faint: rgb(0x737373),
            hover: rgb(0x171717),
            selected: rgb(0x262626),
            selected_text: rgb(0xa5b4fc),
            chip: rgb(0x262626),
            accent: rgb(0x4f46e5),
            accent_soft: rgba(0x1e1b4bb3),
            accent_text: rgb(0x818cf8),
            on_accent: rgb(0xffffff),
            overlay: rgba(0x000000a6),
            circle: rgb(0x737373),
            track: rgb(0x262626),
            cell_off: rgb(0x404040),
        }
    }
}

/// The accent presets (`ACCENTS` in `packages/todo-core/src/theme.ts`): the shades the app draws
/// with, 50, 300, 400, 600, 700 and 950.
pub const ACCENTS: [(&str, [u32; 6]); 6] = [
    (
        "indigo",
        [0xeef2ff, 0xa5b4fc, 0x818cf8, 0x4f46e5, 0x4338ca, 0x1e1b4b],
    ),
    (
        "blue",
        [0xeff6ff, 0x93c5fd, 0x60a5fa, 0x2563eb, 0x1d4ed8, 0x172554],
    ),
    (
        "violet",
        [0xf5f3ff, 0xc4b5fd, 0xa78bfa, 0x7c3aed, 0x6d28d9, 0x2e1065],
    ),
    (
        "emerald",
        [0xecfdf5, 0x6ee7b7, 0x34d399, 0x047857, 0x065f46, 0x022c22],
    ),
    (
        "amber",
        [0xfffbeb, 0xfcd34d, 0xfbbf24, 0xb45309, 0x92400e, 0x451a03],
    ),
    (
        "rose",
        [0xfff1f2, 0xfda4af, 0xfb7185, 0xe11d48, 0xbe123c, 0x4c0519],
    ),
];

impl Theme {
    /// With the accent preset `name` (the synced `accent` preference); indigo for an unknown one.
    pub fn with_accent(mut self, name: &str) -> Self {
        let (_, [s50, s300, s400, s600, s700, s950]) = *ACCENTS
            .iter()
            .find(|(n, _)| *n == name)
            .unwrap_or(&ACCENTS[0]);
        self.accent = rgb(s600);
        if self.dark {
            // `dark:bg-accent-950/70`.
            self.accent_soft = rgba((s950 << 8) | 0xb3);
            self.accent_text = rgb(s400);
            self.selected_text = rgb(s300);
        } else {
            self.accent_soft = rgb(s50);
            self.accent_text = rgb(s600);
            self.selected_text = rgb(s700);
        }
        self
    }
}

/// `#rrggbb` (a project's, label's or habit's colour), or `fallback`.
pub fn hex(s: &str, fallback: u32) -> Rgba {
    let v = s
        .strip_prefix('#')
        .filter(|h| h.len() == 6)
        .and_then(|h| u32::from_str_radix(h, 16).ok())
        .unwrap_or(fallback);
    rgb(v)
}

/// The palette projects without a colour cycle through (`projectStyle.ts`).
pub const PROJECT_COLORS: [u32; 12] = [
    0x6366f1, 0x3b82f6, 0x06b6d4, 0x10b981, 0x84cc16, 0xf59e0b, 0xf97316, 0xef4444, 0xec4899,
    0x8b5cf6, 0x14b8a6, 0xa855f7,
];

/// `resolveProjectColor`: the project's colour, else a stable one from its id.
pub fn project_color(id: &str, color: &str) -> Rgba {
    if !color.is_empty() {
        return hex(color, PROJECT_COLORS[0]);
    }
    let mut h: i32 = 0;
    for c in id.encode_utf16() {
        h = h.wrapping_mul(31).wrapping_add(c as i32);
    }
    rgb(PROJECT_COLORS[(h.unsigned_abs() as usize) % PROJECT_COLORS.len()])
}

pub fn priority_color(p: u8) -> Option<Rgba> {
    match p {
        1 => Some(rgb(RED)),
        2 => Some(rgb(ORANGE)),
        3 => Some(rgb(BLUE)),
        _ => None,
    }
}
