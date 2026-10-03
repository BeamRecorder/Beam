export class StillEncodingError extends Error {
  readonly code: 'dimensions' | 'render-unavailable' | 'encoding-unavailable';
  constructor(code: StillEncodingError['code']) {
    super(code);
    this.code = code;
  }
}
