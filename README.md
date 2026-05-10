# mapMyBusiness

Business onboarding service for the Omni-Brain platform. Owns:

- Business profile (single-tenant: company name, website, industry, HQ, etc.)
- Suppliers (upstream supply chain)
- Clients (downstream customers)
- Employees + invite-only registration
- Onboarding status flags

## Two ways to run it

### 1. Mounted into another Express app (primary path)

```js
const { createRouter } = require('wa-field-tracker-mapmybusiness');

app.use('/api', createRouter({ requireAuth: yourAuthMiddleware }));
```

The host provides the `requireAuth` middleware (which must populate `req.user.email`).

### 2. Standalone HTTP server (Docker)

```bash
docker run -p 3002:3002 \
  -e SUPABASE_URL=... \
  -e SUPABASE_KEY=... \
  dhruvsharma983/map-my-business:latest
```

Routes are mounted under `/api`. Health check at `/health`.

## Environment

- `SUPABASE_URL` (required)
- `SUPABASE_KEY` (required)
- `PORT` (standalone only, default `3002`)

## Schema requirements

Tables expected in Supabase: `business_profile`, `suppliers`, `clients`, `employees`, `employee_invitations`. See the migration in the parent project.
