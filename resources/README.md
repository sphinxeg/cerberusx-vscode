Icon resources and generation

Files to provide in `resources/`:
- `icon.svg` — vector source (already present). Editable and canonical.
- `icon.png` — root extension icon (recommended 128x128 PNG for Marketplace);
- `icon-32.png` — small variant used by some clients (32x32).
- `light/icon.png` and `dark/icon.png` — optional theme-specific icons.

Recommended workflow (Windows PowerShell):

1) Using ImageMagick (convert)

```powershell
# generate 128x128 PNG
magick convert resources/icon.svg -resize 128x128 resources/icon.png
# generate 32x32 PNG
magick convert resources/icon.svg -resize 32x32 resources/icon-32.png
# generate theme variants if needed (light/dark)
magick convert resources/icon.svg -resize 128x128 resources/light/icon.png
magick convert resources/icon.svg -resize 128x128 resources/dark/icon.png
```

2) Using Inkscape (if installed)

```powershell
# export 128x128 PNG with inkscape 1.0+ CLI
inkscape resources/icon.svg --export-type=png --export-filename=resources/icon.png --export-width=128 --export-height=128
inkscape resources/icon.svg --export-type=png --export-filename=resources/icon-32.png --export-width=32 --export-height=32
```

3) Quick manual conversion (if you don't have above tools):
- Open `resources/icon.svg` in a vector editor (Illustrator, Inkscape, Figma) and export PNGs at the sizes above.

Notes:
- The `package.json` root `icon` field should point to a PNG (commonly `resources/icon.png`).
- Activity bar icons may be SVG or PNG; `package.json` references `resources/icon.svg` for the activity bar.
- Marketplace requires a 128x128 PNG for publishing; include that before packaging/publishing.

Important packaging note:
- Do not commit generated PNGs into the repository if you want to avoid repository or package bloat.
- The repository should keep the SVG sources only; generate PNGs locally or in a CI step that does not commit artifacts.
- To ensure the published extension does not include extra image files, a `.vscodeignore` has been added which excludes generated PNGs and the generator script by default.
