// Single source of truth for the live audio amplitude (0..1). Written by the mic
// (while listening) and by TTS playback (while speaking); read by the canvas orb
// each frame. Also mirrored to a CSS var for any CSS-driven reactions.

let current = 0

export function setLevel(value: number): void {
  current = value
  document.documentElement.style.setProperty('--mic-level', String(value))
}

export function getLevel(): number {
  return current
}
