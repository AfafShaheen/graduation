# Graduation Ticket System

System for issuing and scanning graduation ceremony tickets.

## Structure

This branch (`dev`) contains both the frontend and backend in separate directories:
- `front/` — Frontend web client.
- `back/` — Backend API server, business logic, and database migrations.

## Email (SMTP) configuration

OTP codes are emailed to graduates for account activation and password reset.
The backend reads these environment variables (see `.env.example`):

| Variable        | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `APP_ENV`       | `development` / `test` / `production`.                          |
| `SMTP_HOST`     | SMTP server host (empty = not configured).                     |
| `SMTP_PORT`     | SMTP port (default `587`).                                     |
| `SMTP_USER`     | SMTP login user (empty = not configured).                      |
| `SMTP_PASSWORD` | SMTP login password.                                           |
| `SMTP_FROM`     | From address; falls back to `SMTP_USER` when empty.            |

Behaviour:

- **Configured** (`SMTP_HOST` + `SMTP_USER` set): a real SMTP send is attempted.
- **Not configured in `development`/`test`**: the OTP is only logged so local
  flows work; this is reported as `development_logged`, never as a real send.
- **Not configured in any other environment**: sending is refused and reported
  as a failure — registration returns `otp_sent: false` with a clear message,
  and resend/change-email return HTTP 503 with a visible error.

Staff can check the live status at `GET /api/admin/settings/email-status`
(admin token required); it never returns secrets.
