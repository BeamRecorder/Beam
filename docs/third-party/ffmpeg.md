# FFmpeg libraries used by the optional Linux exporter

Beam's optional Linux GPU export helper dynamically links to externally installed FFmpeg libraries. FFmpeg is a separate project, copyright its contributors, licensed under LGPL 2.1-or-later for the pinned build described here. Beam does not claim ownership of FFmpeg.

No FFmpeg executable, shared library or codec is copied into Beam's exporter resources. Users install the compatible external libraries and the `ffmpeg` command themselves. The separate FFmpeg command also performs audio encoding and remuxing.

The CI build dependency is the unmodified [FFmpeg 8.1.3 release source](https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz). Its SHA-256 is `7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3`. The reproducible configuration is in [`scripts/native/ffmpeg-lgpl.sh`](../../scripts/native/ffmpeg-lgpl.sh), and [development instructions](../dev/ffmpeg-gpu-export.md) explain library selection and the expected ABI.

A verbatim copy of LGPL 2.1 is included in [FFmpeg-LGPL-2.1.txt](FFmpeg-LGPL-2.1.txt). FFmpeg remains subject to its own license regardless of Beam's license or commercial terms. Nothing in Beam's terms should limit the LGPL permissions to replace or modify these external libraries, or debug those modifications.

Run `beam-ffmpeg-export --ffmpeg-info` to inspect the actual loaded libraries. The build and packer refuse GPL/nonfree libraries and static FFmpeg linkage. This inspection does not change the permissions granted by third-party licenses.

See [FFmpeg's official licensing guidance](https://ffmpeg.org/legal.html) and [release verification instructions](https://ffmpeg.org/download.html#release-verification).
