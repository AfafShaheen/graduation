# Graduation Ticket System

System for issuing and scanning graduation ceremony tickets.

## Branch layout

| Branch | Contents |
|--------|----------|
| `main`  | Repo scaffolding only (`.gitignore`, `README.md`). Integration point. |
| `back`  | Backend: API server, business logic, and `migrations/` (PostgreSQL schema). |
| `front` | Frontend: web client. |

## Database schema

The PostgreSQL schema lives on the `back` branch under `migrations/`.
