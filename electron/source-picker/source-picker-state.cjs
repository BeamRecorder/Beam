function isDevelopmentSourceDataEnabled(isPackaged, env = process.env) {
  return !isPackaged && env.DEV_CROSSPLATFORM === '1';
}

function initialPickerState(kind, sources = [], development = false) {
  if (!['screen', 'window'].includes(kind)) throw new TypeError('Invalid source picker kind');
  return { kind, sources, development, highlightedId: null, selectedId: null, error: null };
}

function reducePickerState(state, action) {
  if (!action || typeof action !== 'object') throw new TypeError('Invalid source selection action');
  if (action.type === 'kind') return initialPickerState(action.kind, state.sources, state.development);
  if (action.type === 'confirm') return state;
  if (!['hover', 'select'].includes(action.type)) throw new TypeError('Invalid source selection action');
  if (!state.sources.some((source) => source.kind === state.kind && source.id === action.id))
    throw new TypeError('Unknown capture source');
  return {
    ...state,
    highlightedId: action.id,
    selectedId: action.type === 'select' ? action.id : state.selectedId,
    error: null,
  };
}

module.exports = { isDevelopmentSourceDataEnabled, initialPickerState, reducePickerState };
