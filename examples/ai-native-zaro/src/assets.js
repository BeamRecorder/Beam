const files = import.meta.glob('../references/ui/*.{png,svg}', { eager: true, query: '?url', import: 'default' });
export function asset(name) {
  const path = Object.keys(files).find((path) => path.endsWith('/' + name));
  if (!path) throw new Error('Missing local Zaro reference asset: ' + name);
  return files[path];
}
export function image(name, className = '', extra = '') {
  return `<img class="${className}" src="${asset(name + '.png')}" alt="" ${extra}>`;
}
export function cursor(className = 'cursor') {
  return `<img class="${className}" src="${asset('cursor.svg')}" alt="">`;
}
