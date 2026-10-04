import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import chimeSound from "../../assets/sounds/chime.m4a";

/**
 * The focus timer's phase-end chime, the single place the app makes a sound. Never import
 * `expo-audio` from a component: this module owns the player so the asset is decoded once.
 *
 * Like `lib/haptics`, calls are fire-and-forget: audio focus taken by another app, a browser
 * without a user gesture yet, or a decode failure must never break the timer, so failures are
 * swallowed. There is no enable flag here; the one call site, in `FocusProvider`, reads
 * `focus_sound_enabled` directly.
 */

/** Created on first use, then reused. */
let player: AudioPlayer | null = null;
/** Set once the first attempt fails, so a broken audio stack is not retried every phase. */
let unavailable = false;

export function chime(): void {
  if (unavailable) return;
  try {
    player ??= createAudioPlayer(chimeSound);
    // Rewind first: a player parked at the end of the clip will not restart on `play()` alone.
    player.seekTo(0);
    player.play();
  } catch {
    unavailable = true;
  }
}
