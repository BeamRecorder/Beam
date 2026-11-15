import ts from 'typescript';

function binds(name, identifier) {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some((element) => ts.isBindingElement(element) && binds(element.name, identifier));
}

/** A domain variable named `window` is not the browser global. Check only its actual loop scope. */
export function isIterationBinding(node) {
  for (let child = node; child.parent; child = child.parent) {
    const loop = child.parent;
    if (!(ts.isForOfStatement(loop) || ts.isForInStatement(loop))) continue;
    // Do not let a loop binding exempt its collection expression from host checks.
    if (child === loop.expression || !ts.isVariableDeclarationList(loop.initializer)) continue;
    if (loop.initializer.declarations.some((declaration) => binds(declaration.name, node.text))) return true;
  }
  return false;
}
