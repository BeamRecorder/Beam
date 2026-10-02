export interface GaussianKernel {
  radius: number;
  center: number;
  weights: Float32Array;
  offsets: Float32Array;
  pairs: number;
}
export interface GaussianLevel {
  width: number;
  height: number;
  sigmaX: number;
  sigmaY: number;
}
