/** Visual tone of a status indicator. */
export type StatusTone = 'idle' | 'running' | 'success' | 'error';

/** A small status shown in the top bar (compiler state or execution state). */
export interface StatusIndicator {
  tone: StatusTone;
  label: string;
  detail?: string;
}
