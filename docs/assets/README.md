Assets for walkthrough GIFs

Place your GIFs and images here under `docs/assets/`.

Naming guidelines:
- `build-demo.gif` — sidebar Build & Run demo (8–12s)
- `settings-pathofcerberusx.gif` — show configuring PathOfCerberusX
- `debug-terminal.gif` — demo of launching debug into terminal

Size & optimization guidance:
- Target width: 600–800 px for README GIFs.
- Keep duration short (6–12s). Use `gifsicle -O3` to optimize.

Don't commit huge GIFs to the repository. Prefer using CI artifacts or GitHub Releases for large media.
