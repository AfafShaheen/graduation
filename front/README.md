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
