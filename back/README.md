# Graduation Ticket System — Backend

Backend branch. Contains the API server, business logic, and the database schema.

## Contents

- `migrations/` — PostgreSQL schema migrations for the graduation ticket system.

## Related branches

- `main`  — repo scaffolding and integration point.
- `front` — frontend web client.

## Running the tests

The test suite must run inside the `back` container (it needs PostgreSQL and
Redis from the Compose network). It targets a dedicated database named
`graduation_test` and Redis DB 15, and refuses to run against any database whose
name does not end with `_test`.

```sh
docker compose exec back sh -c "pip install -r requirements-dev.txt && pytest -q"
```
