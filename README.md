# NZAT Jan2026 (Docker Run Guide)

This setup is for users who **only have Docker**. Follow the steps below to start.

## Package Contents (include in delivery)
- Source code (including `apps/`, `backend/`, `*.sln`, `docker-compose.yml`, Dockerfiles, etc.)
- `Dockerfile` (frontend `apps/shell/Dockerfile`, backend `backend/Workshop.Api/Dockerfile`)
- `docker-compose.yml`
- `.env.example`
- `README_PREVIEW.md`

## Do NOT include
- `node_modules/`
- `bin/`, `obj/`
- `.env`
- Local cache folders (e.g. `.vite/`, `dist/`, `.cache/`)

> A `.dockerignore` is already provided to keep these out of build context.

---

## Quick Start (Recommended)

1) Copy the env template
```bash
cp .env.example .env
```

2) Start services
```bash
docker compose up --build
```

3) Access
- Web UI: `http://localhost:5173`
- API: `http://localhost:8080`

---

## Database Notes

This project uses PostgreSQL. The `docker-compose.yml` already includes a `db` service and **automatic SQL initialization**:
- Init scripts live in: `db/init/001_schema.sql`
- On the first container startup, SQL under `/docker-entrypoint-initdb.d` runs automatically

The connection string is configured via `.env`:
```
DB_CONN_STRING=Host=db;Port=5432;Database=workshop;Username=postgres;Password=postgres
```

### Automatic Init Flow (Recommended)

1) Put your SQL init files into `db/init/` (multiple files are OK; they run in filename order)
2) On **first boot**, run `docker compose up --build`
3) To re-run initialization (wipe DB and rebuild):
```bash
docker compose down -v
docker compose up --build
```

### Manual Init (Optional)

If the DB already exists and you do not want to wipe it:
```bash
docker compose exec -T db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} < db/init/001_schema.sql
```

---

## FAQ

1) **Frontend cannot reach API?**
The frontend is served by Nginx and proxies `/api` to the `api` container. Make sure `api` is running.

2) **Port conflicts?**
Change `WEB_PORT` / `API_PORT` in `.env`.

3) **Empty DB on first run**
Make sure init SQL files exist under `db/init/`.

---

## Service Layout

- `web`: Frontend (Vite build served by Nginx)
- `api`: .NET 8 API
- `db`: PostgreSQL
- `emqx`: MQTT broker for eStation communication monitoring

## Development Docs

- [Light finder migration and deployment guide](docs/light-finder-migration-deploy.md)
- [Self-hosted Broker and eStation communication verification](docs/self-hosted-broker-estation-communication.md)

To stop services:
```bash
docker compose down
```

To wipe database (dangerous):
```bash
docker compose down -v
```
