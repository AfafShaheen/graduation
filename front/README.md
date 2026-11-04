# Graduation Ticket System — Frontend

Frontend branch. Contains the web client only.

## Related branches

- `main` — repo scaffolding and integration point.
- `back` — backend API server and database migrations.

## Environment variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL. Leave empty in development so requests go through the Vite proxy. |
| `VITE_PREVIEW` | Set to `true` to enable preview mode (all pages accessible without a session). Works only in the dev server (`npm run dev`); ignored in production builds. Defaults to `false`. |

## Development

```bash
npm install
npm run dev
```

The dev server uses `basicSsl` to serve HTTPS on the LAN (required for the scanner camera on phones).

## Icon font

Icons use a **local subset** of Material Symbols Outlined
(`src/assets/fonts/material-symbols-subset.woff2`, loaded by `src/style/icons.css`).
It holds only the icons the app uses, weight 400, no fill, so there is no request to
Google Fonts. When a screen needs a new icon name, regenerate the subset: install
`material-symbols` temporarily, instantiate the variable font at
`FILL=0, wght=400, GRAD=0, opsz=24` with `fontTools.varLib.instancer`, and subset it
(`fontTools.subset`, layout feature `liga`) with the ligature names the source uses.

## Fonts

The brand font (Ghroob) ships as four WOFF2 files in `src/assets/fonts/` (Regular 400, Medium 500, Bold 700, ExtraBold 800),
subset to Arabic, Latin, digits and common punctuation (about 33 KB each instead of 75 KB). The full OTF originals are kept in
`font-src/` and are not bundled. To rebuild a file:

    py -m fontTools.subset font-src/itfGhroobArabic-Bold.otf --unicodes="U+0020-007E,U+00A0,U+00A9,U+00AB,U+00BB,U+00D7,U+00F7,U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200B-200F,U+2010-2027,U+2030-203A,U+2212,U+2190-2193" --layout-features='*' --flavor=woff2 --output-file=src/assets/fonts/itfGhroobArabic-Bold.woff2
