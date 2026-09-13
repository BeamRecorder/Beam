export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment extends TranscriptWord {
  clipId: string;
  sentenceId: string | null;
  captionLayerId: string | null;
  isAiGenerated: boolean;
  words: TranscriptWord[];
}

export interface CaptionTranscript {
  format: 'beam-transcript';
  schemaVersion: 1;
  timeUnit: 'ms';
  timelineDurationMs: number;
  text: string;
  segments: TranscriptSegment[];
}

export interface TranscriptExportRequest {
  projectName: string;
  transcript: CaptionTranscript;
}

export type TranscriptExportResult = { canceled: true } | { canceled: false; path: string };
