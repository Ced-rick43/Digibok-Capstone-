# DigiBok

Online bookkeeping and BIR-compliance web app for small businesses in Sipocot,
Camarines Sur. Double-entry ledger, tax/permit deadline tracking, financial
statements, payments, and document management for a bookkeeper and their
clients.

**Stack:** React 19 + TypeScript + Vite (frontend) · Node/Express (backend) ·
PostgreSQL (database).

## Run Locally

**Prerequisites:** Node.js, PostgreSQL running locally (or reachable via a
connection string).

1. Install dependencies:
   `npm install`
2. Create the database and load the schema:
   `psql -U <user> -d <database> -f BACKEND/db/schema.sql`
3. Copy `.env.example` to `.env` and fill in the values — most importantly
   `DATABASE_URL` (there is no fallback if it's missing) and `JWT_SECRET`
   (optional for local dev; without it, a random secret is generated on each
   restart, so existing sessions won't survive a server restart).
4. If migrating existing data from an older `db.json`-based install instead of
   starting fresh:
   `npm run migrate:postgres`
5. Run the app:
   `npm run dev`

   This starts the Express backend (`BACKEND/server.ts`) on port 3000, which
   also serves the Vite frontend in dev mode — one process, one port.

## Other scripts

- `npm run lint` — typecheck (`tsc --noEmit`)
- `npm run build` — production build (frontend + bundled backend into `dist/`)
- `npm start` — run the production build
- `npm run db:backup` / `npm run db:restore` — dump/restore the Postgres database
