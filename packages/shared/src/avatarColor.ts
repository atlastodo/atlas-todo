/**
 * Deterministic avatar colors: a string hash maps a user id to a hue with fixed saturation and
 * lightness so white text stays readable in both themes.
 */
export interface AvatarColor {
  background: string;
  color: string;
}

/**
 * The current user always renders in this fixed Atlas indigo so "me" looks the same everywhere;
 * others get their hashed color, where occasional collisions are fine.
 */
export const SELF_AVATAR_COLOR: AvatarColor = { background: "#4f46e5", color: "#fff" };

export function avatarColor(id: string): AvatarColor {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return { background: `hsl(${hue}deg 55% 42%)`, color: "#fff" };
}

export function avatarColorFor(id: string, selfId?: string): AvatarColor {
  return selfId != null && id === selfId ? SELF_AVATAR_COLOR : avatarColor(id);
}
