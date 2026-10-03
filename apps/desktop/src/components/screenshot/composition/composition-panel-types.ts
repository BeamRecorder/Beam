/** Fractions of the available header travel inside the canvas workspace. */
export interface CompositionPanelPosition {
  x: number;
  y: number;
}

export interface CompositionPanelBounds {
  width: number;
  height: number;
  panelWidth: number;
  headerHeight: number;
}

export interface CompositionPanelLayout {
  x: number;
  y: number;
  travelX: number;
  travelY: number;
  upward: boolean;
  bodyHeight: number;
}
