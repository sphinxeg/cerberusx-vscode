# CerberusX Extension Walkthrough

This walkthrough documents the main features of the CerberusX VS Code extension and shows how to record short animated GIFs to demonstrate them.

Sections
- Quick feature tour
- Build & Run (sidebar)
- Settings & PathOfCerberusX
- Debugging flow (terminal)
- Testing mode & integration tests
- How to create polished GIFs for the Marketplace/README

---

## Quick feature tour

- Sidebar: provides Build and Build & Run buttons, and a settings editor for trancc templates.
- Commands: `cerberusx.buildWithTrancc`, `cerberusx.buildAndRunWithTrancc`, `cerberusx.build`, `cerberusx.generateSnippets`.
- Language features: LSP-based completions and a lightweight fallback completion provider.
- Debugging: simple `cerberusx` debug configuration that launches the program in an integrated terminal.

---

## Build & Run (sidebar)

Walkthrough steps to record:

1. Open a workspace that contains a `.cxs` or `.cerberusdoc` file.
2. Switch to the CerberusX sidebar (activity bar icon).
3. Choose a platform and mode in the sidebar UI.
4. Press `Build` and show the Output/Terminal briefly.
5. Press `Build & Run` and show the program starting in the terminal.

Suggested capture length: 8–12 seconds.

---

## Settings & `PathOfCerberusX`

Show how to set `cerberusx.PathOfCerberusX` in Workspace Settings (open Settings UI or `.vscode/settings.json`), then run the build command to demonstrate the extension spawning trancc in that folder.

---

## Debugging flow (terminal)

Show configuring a debug launch (use the default debug config), start debug (launch) and show the terminal receiving the launch command.

---

## Testing mode & integration tests

Show enabling `cerberusx.testing` in workspace settings and running the integration test command (or `npm run test:integration` on CI) to demonstrate the extension recording the constructed trancc command to `cerberusx.lastCommand`.

---

## How to create polished GIFs (recommended pipeline)

This section contains a reliable CLI pipeline that works cross-platform. It produces small, high-quality GIFs suitable for README or Marketplace.

Requirements (recommended):
- `ffmpeg` (capture + conversion)
- `gifsicle` (optimization)
- `magick`/ImageMagick or `convert` (optional resize/trim)

1) Record a short MP4 video of the screen or window (Windows example using gdigrab):

```powershell
# record 12 seconds of a window titled "Visual Studio Code"
# adjust -framerate, -t and -i as needed
ffmpeg -y -f gdigrab -framerate 15 -t 12 -i title="Visual Studio Code" capture.mp4
```

2) Convert video to GIF (good defaults):

```bash
# convert to optimized GIF with target width 800px (preserves aspect)
ffmpeg -i capture.mp4 -vf "fps=15,scale=800:-1:flags=lanczos" -loop 0 out.gif
gifsicle -O3 --colors 256 out.gif -o out.optim.gif
```

3) Further shrink (optional): reduce frame rate or crop, or re-encode via ImageMagick.

Notes:
- Keep GIFs short (6–12s) and narrow (<= 800px width) to avoid large files.
- Use `gifsicle -O3` to aggressively optimize frames.
- For Marketplace screenshots, the recommended size is 1280×720 or smaller; animated GIFs should still be optimized.

---

## Embedding GIFs in README or docs

Place GIFs under `docs/assets/` and reference them in markdown:

```md
![Build demo](docs/assets/build-demo.gif)
```

Keep the file name descriptive and avoid committing very large GIFs — use CI-generated artifacts or GitHub Releases for distribution if necessary.

---

If you'd like, I can:
- Add `docs/assets/` and a small placeholder file and example markdown embed.
- Create a short script that runs `ffmpeg` + `gifsicle` with sane defaults for Windows PowerShell and Linux shells.
- Draft ready-to-use captions and alt text for each GIF for accessibility and Marketplace metadata.

End of walkthrough.
