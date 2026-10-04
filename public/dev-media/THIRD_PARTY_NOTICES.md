# Demo webcam footage

`demo-webcam.mp4` is an eight-second, silent 640 × 360, 15 fps derivative of
[Woman counting on fingers](https://commons.wikimedia.org/wiki/File:Woman_counting_on_fingers.webm)
by Mvolz, recorded on 2020-02-18 and published on Wikimedia Commons. It shows
a woman speaking to a webcam and demonstrating finger counting. The author
explicitly dedicated their own work under CC0. Checked on 2026-10-04.

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

Source download: https://upload.wikimedia.org/wikipedia/commons/e/e5/Woman_counting_on_fingers.webm

The derivative starts at source time 1 s, lasts 8 s, removes audio, reduces frame
rate to 15 fps and uses H.264 at 250 kbit/s. It is bundled only as an optional
Developer Mode fixture. Activating the fixture copies the video into the project.

Reproduction with FFmpeg:

```sh
ffmpeg -ss 1 -i source.webm -t 8 -vf scale=640:360,fps=15 -c:v libopenh264 -b:v 250k -pix_fmt yuv420p -an -movflags +faststart demo-webcam.mp4
```
