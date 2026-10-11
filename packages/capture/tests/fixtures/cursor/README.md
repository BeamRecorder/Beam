# Cursor recognition fixture

`figma-resize.png` is a 40 × 40 raster of Figma's small diagonal double-arrow cursor, extracted from the public Table/Grid component's cursor artwork. The `-32` and `-80` variants cover standard and Retina bitmap sizes. Source: <https://www.figma.com/webpack-artifacts/assets/7a72fc59-f953c4ec1ef6ed65.min.js.br> (retrieved October 10, 2026).

It exercises transparent padding, antialiasing and open arrowheads using real application artwork. It is test data only; no Figma artwork is shipped by the capture engine. The recognizer examines the live native cursor bitmap rather than application names, hashes or fixture matches. This fixture does not establish the exact bitmap used in an older recording, whose cursor images were not saved.
