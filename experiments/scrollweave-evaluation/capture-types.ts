export interface BrowserCaptureCase {
  name: string;
  frames: string[];
  positions: number[];
  truth: string;
  content: [number, number, number, number];
}
