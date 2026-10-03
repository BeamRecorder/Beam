"""Mix locally frozen CC0 music and transition effects into a 15-second score."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "references/audio"
DURATION = 15
BEAT = DURATION / 32
WHOOSH = [cue * BEAT - .22 for cue in [4, 8, 12, 16, 20, 24]]
IMPACTS = [cue * BEAT for cue in [4, 16, 24]]

filters = [
    "[0:a]atrim=duration=15,asetpts=PTS-STARTPTS,volume=0.8[bed]",
    "[1:a]atrim=start=0.05:duration=0.7,asetpts=PTS-STARTPTS,highpass=f=180,volume=0.30,asplit=6" +
    "".join(f"[w{i}]" for i in range(6)),
    "[2:a]asetrate=32000,aresample=48000,volume=0.55,asplit=3" +
    "".join(f"[i{i}]" for i in range(3)),
]
tracks = ["[bed]"]
for prefix, times in [("w", WHOOSH), ("i", IMPACTS)]:
    for index, time in enumerate(times):
        label = f"{prefix}{index}mix"
        filters.append(f"[{prefix}{index}]adelay={round(time * 1000)}:all=1[{label}]")
        tracks.append(f"[{label}]")
filters.append("".join(tracks) +
    f"amix=inputs={len(tracks)}:duration=first:normalize=0," +
    "loudnorm=I=-14:TP=-1:LRA=9,afade=t=in:d=0.015,afade=t=out:st=14.65:d=0.35," +
    "aresample=48000[audio]")
subprocess.run([
    "ffmpeg", "-y", "-v", "error",
    "-i", str(AUDIO / "cc0/empacotatron_loop.ogg"),
    "-i", str(AUDIO / "cc0/whoosh2_0.wav"),
    "-i", str(AUDIO / "cc0/qubodupImpact/qubodupImpactStone.flac"),
    "-filter_complex", ";".join(filters), "-map", "[audio]", "-t", str(DURATION),
    "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(AUDIO / "ai-native-score.wav"),
], check=True)
(AUDIO / "cues.json").write_text(json.dumps({
    "durationSeconds": DURATION, "animationBpm": 128, "voiceover": False,
    "whooshSeconds": WHOOSH, "impactSeconds": IMPACTS,
    "music": "Empacotatron — Fupi (CC0)", "mixTargetLufs": -14,
}, indent=2) + "\n")
print("CC0 music + synchronized impacts: 15s, stereo, 48kHz, -14 LUFS target")
