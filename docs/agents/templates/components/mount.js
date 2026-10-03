/** Mount trusted local template markup. User text belongs in textContent/value. */
export function mountTemplate(parent, markup) {
  const template = parent.ownerDocument.createElement('template');
  template.innerHTML = markup.trim();
  if (template.content.childElementCount !== 1) throw new Error('A component template needs one root element.');
  const element = template.content.firstElementChild;
  parent.append(element);
  return element;
}
