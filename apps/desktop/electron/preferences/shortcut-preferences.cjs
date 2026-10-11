const actions = require('../../shared/action-bindings.json');
function defaultActionBindings() {
  return Object.fromEntries(
    actions.map((action) => [
      action.id,
      {
        keys: action.keys,
        scope: action.scope,
        category: action.group,
      },
    ]),
  );
}
module.exports = { defaultActionBindings };
