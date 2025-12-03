# Recording + GIF conversion scripts

This file contains example scripts (PowerShell and Bash) you can run locally to produce optimized GIFs from a screen recording.

PowerShell (Windows) example - `scripts/record-and-convert.ps1` (you can copy these lines into a local script):

```powershell
param(
  [string]$WindowTitle = 'Visual Studio Code',
  [int]$Seconds = 10,
  [int]$Fps = 12,
  [int]$Width = 600
)

$mp4 = "capture.mp4"
$gif = "capture.gif"
$out = "capture.optim.gif"

Write-Host "Recording $Seconds seconds of window '$WindowTitle'..."
ffmpeg -y -f gdigrab -framerate $Fps -t $Seconds -i title="$WindowTitle" $mp4

Write-Host "Converting to GIF ($Width px wide)..."
ffmpeg -i $mp4 -vf "fps=$Fps,scale=$Width:-1:flags=lanczos" -loop 0 $gif

Write-Host "Optimizing GIF..."
gifsicle -O3 --colors 256 $gif -o $out

Write-Host "Done -> $out"
```

Bash (Linux/macOS) example:

```bash
ffmpeg -y -f x11grab -framerate 12 -t 10 -i :0.0 capture.mp4
ffmpeg -i capture.mp4 -vf "fps=12,scale=600:-1:flags=lanczos" -loop 0 capture.gif
gifsicle -O3 --colors 256 capture.gif -o capture.optim.gif
```

Tips:
- Record only the portion of the screen you need to keep file sizes small.
- If ffmpeg is not available, ScreenToGif (Windows) or Peek (Linux) provide a GUI for quick captures.
