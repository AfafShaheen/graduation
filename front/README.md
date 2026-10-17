# Graduation Ticket System — Frontend

Frontend branch. Contains the web client only.

## Related branches

- `main` — repo scaffolding and integration point.
- `back` — backend API server and database migrations.

## Environment variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL. Leave empty in development so requests go through the Vite proxy. |
| `VITE_PREVIEW` | Set to `true` to enable preview mode (all pages accessible without a session). Defaults to `false`. |

## Development

```bash
npm install
npm run dev
```

The dev server uses `basicSsl` to serve HTTPS on the LAN (required for the scanner camera on phones).
