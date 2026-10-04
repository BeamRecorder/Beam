import { BUILTIN_CURSOR_PACKS } from "../../../apps/desktop/src/components/editor/properties/cursor/cursor-packs";

export const PACKS = BUILTIN_CURSOR_PACKS.filter((pack) =>
  ["builtin:macos", "builtin:bibata-material-noir"].includes(pack.id),
);
export const PACK_OPTIONS = PACKS.map((pack) => ({
  value: pack.id,
  label: pack.id === "builtin:bibata-material-noir" ? "Bibata Noir" : pack.name,
  thumbnail: pack.cursors.find((cursor) => cursor.id === pack.defaultCursorId)!
    .url,
}));
export const CURSOR_IMAGES = PACKS.flatMap((pack) => [
  ...new Map(pack.cursors.map((cursor) => [cursor.url, cursor])).values(),
]);

// Aliases share artwork, but every native role remains represented in the gallery.
export const GALLERIES = PACKS.map((pack) => ({
  pack,
  artwork: [...new Set(pack.cursors.map((cursor) => cursor.url))].map(
    (url) => ({
      asset: pack.cursors.find((cursor) => cursor.url === url)!,
      roles: pack.cursors
        .filter((cursor) => cursor.url === url)
        .map((cursor) => cursor.id),
    }),
  ),
}));
