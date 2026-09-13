export const DEFAULT_EDITOR_TITLE = 'Beam Editor';

export const editorTitle = (projectName: string) => {
  const normalizedName = projectName
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return normalizedName ? `${normalizedName} - ${DEFAULT_EDITOR_TITLE}` : DEFAULT_EDITOR_TITLE;
};
