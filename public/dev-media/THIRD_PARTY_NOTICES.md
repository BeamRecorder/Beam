# Demo webcam footage

`demo-webcam.mp4` is an eight-second, silent 640 × 480, 24 fps derivative of
[Paulina Grajeda Castillo](https://commons.wikimedia.org/wiki/File:Paulina_Grajeda_Castillo.webm)
by A01569168, recorded on 2024-06-07 and published on Wikimedia Commons on
2024-06-08. It shows an architect speaking during a webcam interview, with her
face unobscured throughout the selected passage. The author explicitly dedicated
their own work under CC0. Checked on 2026-10-04.

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

Source download: https://upload.wikimedia.org/wikipedia/commons/8/82/Paulina_Grajeda_Castillo.webm

The derivative starts at source time 115 s, lasts 8 s, removes audio and metadata,
crops a 944 × 708 region at (280, 24) to center the speaker and remove the call's
name label and black bars, and uses H.264 at CRF 28 with 24 fps. The result is
189,355 bytes. It is bundled only as an optional
Developer Mode fixture. Activating the fixture copies the video into the project.

Reproduction with FFmpeg:

```sh
ffmpeg -ss 115 -i source.webm -t 8 -vf 'crop=944:708:280:24,scale=640:480,fps=24,setsar=1' -map 0:v:0 -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -an -map_metadata -1 -movflags +faststart demo-webcam.mp4
```
