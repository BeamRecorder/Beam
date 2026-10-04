// Every artwork in the two showcased native packs is frozen locally, unchanged.
const frozen = import.meta.glob<string>("../assets/cursors/**/*.{svg,png}", {
  eager: true,
  query: "?url",
  import: "default",
});
const assets = new Map(
  Object.entries(frozen).map(([file, url]) => [
    `${file.includes("/macos/") ? "/macOsSvgCursors/" : "/cursorPacks/assets/"}${file.split("/").at(-1)}`,
    url,
  ]),
);
export function resolvePublicAssetUrl(path: string) {
  return assets.get(path) ?? path;
}
