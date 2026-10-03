export interface CaptionInlineTextUpdate {
  clipId: string;
  customText: string | undefined;
}

export interface CaptionInlineEditingEnd {
  cancelled: boolean;
}
