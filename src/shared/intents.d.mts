export type Intent =
  | { type: 'time' }
  | { type: 'timer'; seconds: number; label: string | null }
  | { type: 'weather'; location: string }

export declare function parseDuration(text: string): number | null
export declare function parseIntent(text: string): Intent | null
