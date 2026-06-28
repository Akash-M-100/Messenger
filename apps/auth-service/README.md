# Auth Service

Handles signup/login for the Unified Messaging Service, and also hosts the
**Relay** front-end — the static HTML dashboard for sending and managing
messages (SMS, WhatsApp, Voice, Email, bulk messaging, templates, API keys,
settings).

## Run it locally

```bash
# from the repo root
cp .env.example .env        # if you haven't already
pnpm --filter @ums/db exec prisma db push
pnpm --filter @ums/auth-service dev
```

`dev` runs `build` (tsc + copies `src/public` into `dist/public`) and then
`start`. The service listens on `AUTH_SERVICE_PORT` (default `3003`).

Required env vars (see root `.env.example`):

| Variable             | Purpose                                                        |
| -------------------- | --------------------------------------------------------------- |
| `AUTH_SERVICE_PORT`  | Port this service listens on. Default `3003`.                   |
| `AUTH_API_KEY`       | API key this service uses to call api-gateway (`/v1/messages`). |
| `API_GATEWAY_URL`    | Base URL of api-gateway. Default `http://localhost:3000`.       |
| `DATABASE_URL`       | Postgres connection string (shared with other services).        |

> **Note:** This service used to read a generic `PORT` variable, which
> collided with api-gateway's own `PORT=3000` since both services load the
> same root `.env` file. It now reads `AUTH_SERVICE_PORT` specifically, so
> both services can run side-by-side from one `.env` file without a port
> clash.

## URLs to open in the browser

With the service running on the default port:

| Page              | URL                                          |
| ------------------ | --------------------------------------------- |
| Sign up / Login    | `http://localhost:3003/`                      |
| Dashboard          | `http://localhost:3003/relay/dashboard.html`  |
| Send Message       | `http://localhost:3003/relay/send-message.html` |
| SMS                | `http://localhost:3003/relay/sms_message.html` |
| WhatsApp           | `http://localhost:3003/relay/whatsapp_message.html` |
| Voice              | `http://localhost:3003/relay/voice_message.html` |
| Bulk Messaging     | `http://localhost:3003/relay/bulk_messaging.html` |
| Templates          | `http://localhost:3003/relay/templates.html`  |
| History            | `http://localhost:3003/relay/history.html`    |
| API Keys           | `http://localhost:3003/relay/api-keys.html`   |
| Providers          | `http://localhost:3003/relay/providers.html`  |
| Settings           | `http://localhost:3003/relay/settings.html`   |

Logging in successfully redirects to the Dashboard automatically.

api-gateway separately serves its own settings page at
`http://localhost:3000/settings` (port `3000` is api-gateway, not
auth-service — don't confuse the two `settings.html` files, they're
different files serving different purposes).

## Notes on the Relay pages

The pages under `src/public/relay/` are static front-end prototypes — they
render real UI and have local interactivity (tab switching, simulated
uploads, etc.) but don't yet call any backend API. Wiring them up to
api-gateway's `/v1/messages` and the Admin API is future work.

`providers.html` is a read-only placeholder summarizing the providers
(Twilio for SMS/Voice/WhatsApp, Resend for Email) already configured in the
Prisma schema — full provider management UI is not built yet.
