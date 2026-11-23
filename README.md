# Electricity Billing Management System

A full-stack web application that digitises electricity utility operations. It covers customers, connections, meter readings, tariff-based billing, PDF invoices, demo payments, complaints, notifications, reports and analytics.

It is software only. Meter readings are entered by staff, imported from CSV, or simulated, and no hardware is needed. Payments run in **Demo Payment Mode**, which means no real money is ever transferred.

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript, Tailwind CSS, Recharts, React Router, React Hook Form + Zod, Axios, Lucide icons, Sonner toasts |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, JWT (PyJWT), bcrypt, ReportLab |
| Database | SQLite (current, local). PostgreSQL planned for deployment |
| Tests | Pytest (57 tests) |

---

## 1. Quick start (local, SQLite)

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env             # SQLite is the default; set a JWT_SECRET_KEY
python -m seed.seed --reset        # demo data
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                        # http://localhost:5173  (proxies /api to :8000)
```

API documentation (Swagger): **http://localhost:8000/api/docs**. ReDoc: `/api/redoc`.

### Demo accounts (local/demo only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@electricity.com | Admin@123 |
| Staff | staff@electricity.com | Staff@123 |
| Customer | customer@electricity.com | Customer@123 |

The login page has one-click buttons that fill these in. Change the passwords from **Settings / Profile**.

## 2. Database: SQLite now, PostgreSQL later

The app currently runs on **SQLite**, a single file `backend/ebms_local.db` with no server to install. The code is database-neutral (SQLAlchemy ORM), and the only dialect-specific piece, month grouping for charts, already supports PostgreSQL.

**Switching to PostgreSQL** (when ready):

```sql
CREATE DATABASE ebms;
CREATE USER ebms WITH PASSWORD 'ebms_password';
GRANT ALL PRIVILEGES ON DATABASE ebms TO ebms;
ALTER DATABASE ebms OWNER TO ebms;
```

In `backend/.env`:

```
DATABASE_URL=postgresql+psycopg2://ebms:ebms_password@localhost:5432/ebms
AUTO_CREATE_TABLES=false
```

```bash
cd backend
pip install -r requirements.txt   # includes psycopg2-binary
alembic upgrade head              # creates all 16 tables
python -m seed.seed               # demo data (or migrate your SQLite data)
pytest -q                         # re-run tests against Postgres if desired
```

`backend/schema.mysql.sql` is kept only as a reference DDL for MySQL.

**Migrations for future model changes:** `alembic revision --autogenerate -m "describe change"` then `alembic upgrade head`.

## 3. Docker (PostgreSQL + API + web)

```bash
docker compose up --build
docker compose exec backend python -m seed.seed
```

The web app is at http://localhost:8080 and the API at http://localhost:8000/api/docs.

## 4. Deployment

* **Backend → Render / Railway.** Deploy the `backend/` folder with its Dockerfile. It runs `alembic upgrade head` and then starts uvicorn on `$PORT`. Set these environment variables: `DATABASE_URL` (managed PostgreSQL, e.g. Render/Railway/Neon/Supabase), `JWT_SECRET_KEY` (a long random value), `ENVIRONMENT=production`, `AUTO_CREATE_TABLES=false`, `CORS_ORIGINS=https://<your-vercel-app>`, `FRONTEND_URL`, and SMTP values if you want email.
* **Frontend → Vercel.** Root directory `frontend`, build command `npm run build`, output `dist`, and env var `VITE_API_URL=https://<your-backend-host>`. `vercel.json` handles routing for the single-page app.
* **Database.** Managed PostgreSQL (Render, Railway, Neon or Supabase). Run `python -m seed.seed` once only if you want demo data.

---

## 5. Features

**Roles.** There are three roles, Admin, Staff and Customer. Every permission is enforced in the backend (`app/core/deps.py`), not just hidden in the UI.

| Module | Highlights |
|---|---|
| Authentication | Login/logout, forgot and reset password (single-use, hashed, 30-minute token), change password, bcrypt hashing, JWT with server-side revocation on logout or password change (token version), login rate limit (5 tries per 5 minutes) |
| Customers | Auto ID (`CUST-00001`); add with first connection and optional portal login; search by name, ID, connection or meter; filters, sorting, pagination, CSV export; full profile page with history |
| Connections | Separate from customers (one customer can have several); meter registry; status changes with reason, which notify the customer; tariff change; full change history |
| Meter readings | Units = current − previous (previous is filled in automatically). Rejects readings lower than the last one, duplicate months and out-of-order months. Edits need a reason and are audit-logged (only the latest unbilled reading can be edited). CSV import with a per-row error report, simulated monthly readings, CSV report |
| Tariffs | Admin-configurable flat or **progressive slab** tariffs, fixed charge, electricity duty %, additional charges, effective and expiry dates, activate/deactivate, history, bill estimator. Staff can edit tariffs only if an admin allows it in Settings |
| Billing engine | Server-side preview, single and monthly generation, draft → edit → issue, cancel with reason, regenerate. Duplicate bills are blocked in the service **and** by a database UNIQUE key. Tariff rates are **frozen on each bill** (snapshot plus line items), so later tariff edits never change issued invoices. Unpaid balances carry forward, and a late fee is added if the earlier bill was overdue |
| PDF | Professional invoice (readings, slab breakdown, duty, outstanding, QR reference, payment instructions) and payment receipt, both via ReportLab. Download or print |
| Payments | Demo checkout (UPI, card, net banking, demo), success or failure simulation, partial payments, staff counter payments, mark as paid, refunds (admin), receipts. Instrument details are **never sent** to the server |
| Complaints | Customer or staff submission, assignment, a status workflow with allowed moves only, resolution notes, timeline, customer notifications |
| Notifications | In-app centre, unread badge, mark read or read-all, due-soon and overdue reminders, optional email over SMTP |
| Reports | 10 reports (monthly and annual revenue, customers, consumption, pending, overdue, payments, tariffs, complaints, categories) with filters and CSV/PDF export, all built from live data |
| Dashboards | 8 KPIs with month-on-month change, and 6 charts (consumption, revenue, paid vs unpaid, customer growth, consumption distribution, revenue by billing period) with date-range and year filters, hover tooltips and a table view for every chart |
| Admin | Staff management, audit logs (read-only, before/after values), system settings |

### Billing formula

```
Consumption charge = Σ (units in each slab × slab rate)        e.g. 160 units → 100×₹4 + 60×₹6 = ₹760
Duty               = (consumption + fixed + additional) × duty%
Total              = consumption + fixed + additional + duty + late fee + previous outstanding − discount
```

All money uses `Decimal`, rounded half-up to paise. The sample tariffs are demo values only.

> **Tax note.** The bill shows *Electricity Duty* (levied by each state, configurable per tariff) rather than GST. Electrical energy is generally exempt from GST in India. Check the current notification for your state and tariff before you use real rates.

## 6. Security

bcrypt password hashing; JWT with expiry and revocation; role checks on every endpoint; ownership checks so customers get a 404 for anyone else's bills, payments, connections or complaints (covered by tests); Pydantic validation on every input; ORM-only queries with whitelisted sort columns and escaped LIKE patterns (no SQL injection); CORS whitelist; rate-limited login and forgot-password; secrets only from environment variables (`.env` is git-ignored); generic error messages; security headers; audit log; email addresses masked in logs and no passwords or tokens logged; protection against formula injection in exported CSV files.

## 7. Tests

```bash
cd backend
pytest -q
```

The 57 tests cover: authentication (login, logout revocation, rate limit, reset flow, deactivated accounts), authorisation and data ownership, customer CRUD and validation, meter-reading rules, tariff slab maths (zero, single slab, multi-slab, boundary, fractional, high, flat), duplicate-bill prevention, tariff snapshot preservation, partial and full payments, overpayment rejection, failed payments, outstanding carry-forward, drafts, monthly runs, PDFs, reports and the complaint workflow.

## 8. Project structure

```
backend/
  app/
    api/            REST routers (auth, users, customers, connections, readings, tariffs, billing, payments,
                    complaints, notifications, analytics, reports, admin)
    core/           config, database, security, auth dependencies, errors, logging
    models/         SQLAlchemy models (16 tables)
    schemas/        Pydantic request schemas + response serializers
    services/       billing engine, tariff maths, payments, readings, PDFs, reports, analytics, notifications, audit
    repositories/   (data access helpers live in utils/pagination for this size of project)
    utils/          pagination, CSV/PDF responses, code generators
    middleware/     rate limiter, security headers
  migrations/       Alembic
  seed/             demo data generator
  tests/            pytest suite
  schema.mysql.sql  reference MySQL DDL
frontend/
  src/
    components/     ui/ design system (Button, Card, Form, Badge, Modal, DataTable, KpiCard, States), charts/
    layouts/        Shell (sidebar + topbar), AuthLayout
    pages/          auth/, app/ (admin & staff), portal/ (customer), shared/
    hooks/ services/ context/ types/ utils/
```

### API overview

All endpoints are under `/api`. List endpoints return `{items, total, page, page_size, pages}` and accept `page`, `page_size`, `sort_by`, `sort_dir` and filters. Errors return `{detail, code}`.

`auth` (login, logout, me, forgot-password, reset-password, change-password) · `users` · `customers` (+ `/me`, `/{id}/profile`, `/export`) · `connections` (+ `/status`, `/tariff`, `/history`) · `readings` (+ `/import`, `/simulate`, `/export`, `/next`) · `tariffs` (+ `/status`, `/history`, `/calculate`) · `billing/preview|generate|generate-monthly|run-reminders` · `bills` (+ `/pdf`, `/issue`, `/cancel`, `/notify`, `/export`) · `payments` (+ `/demo`, `/mark-paid/{bill}`, `/{id}/receipt`, `/{id}/refund`, `/export`) · `complaints` (+ `/status`, `/assign`) · `notifications` · `analytics/dashboard|revenue|consumption|payments` · `reports/{key}?format=json|csv|pdf` · `audit-logs` · `settings`.

The full interactive reference is at `/api/docs`.

## 9. Design system

| Token | Colour | Use |
|---|---|---|
| Page background | `#F5F7FA` | App canvas |
| Surface | `#FFFFFF` | Cards, tables |
| Navy | `#0B1F3A` | Sidebar, brand |
| Electric blue | `#2563EB` | Primary actions, links, active nav |
| Sky accent | `#0EA5E9` | Highlights |
| Text | `#0F172A` / `#64748B` | Primary / secondary ink |
| Border | `#E2E8F0` | Dividers |
| Success | `#16A34A` | Paid / successful |
| Warning | `#EA580C` | Pending / partial |
| Danger | `#DC2626` | Overdue / failed |

Chart colours by category are blue, orange and aqua, an order checked for colour-blind safety. Status colours always appear with a text label and icon.

All demo people, phone numbers and addresses are fictional.
