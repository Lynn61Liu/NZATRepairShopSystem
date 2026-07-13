# Two-Node Deployment

This repository now deploys one image build to two machines:

- Primary Linux node: `/www/wwwroot/NZAT.NET`
- Secondary Mac node: `/Users/lynn/www/wwwroot/NZAT.NET`

Both nodes pull the same images from GHCR and share one external database.

## GitHub Actions flow

Workflow file:

- [`/.github/workflows/docker-ghcr.yml`](/Users/yin/Documents/nzat-Jan2026/.github/workflows/docker-ghcr.yml)

On each push to `main`, GitHub Actions will:

1. Build `ghcr.io/lynn61liu/nzat-api`
2. Build `ghcr.io/lynn61liu/nzat-web`
3. Push both images to GHCR
4. Upload deploy files to the Linux node
5. Upload deploy files to the Mac node
6. SSH into each node and run `deploy.sh`

## Required GitHub Secrets

The workflow currently expects these SSH secrets:

- `SERVER_A_HOST`
- `SERVER_A_PORT`
- `SERVER_A_USER`
- `SERVER_A_SSH_KEY`
- `SERVER_B_HOST`
- `SERVER_B_PORT`
- `SERVER_B_USER`
- `SERVER_B_SSH_KEY`

Suggested mapping:

- `SERVER_A_*`: primary Linux server, the `45...` host
- `SERVER_B_*`: secondary Mac server, the `100...` host

## Server Files

Primary Linux templates:

- [`deploy/primary-linux/docker-compose.yml`](/Users/yin/Documents/nzat-Jan2026/deploy/primary-linux/docker-compose.yml)
- [`deploy/primary-linux/deploy.sh`](/Users/yin/Documents/nzat-Jan2026/deploy/primary-linux/deploy.sh)
- [`deploy/primary-linux/env.example`](/Users/yin/Documents/nzat-Jan2026/deploy/primary-linux/env.example)

Secondary Mac templates:

- [`deploy/secondary-mac/docker-compose.yml`](/Users/yin/Documents/nzat-Jan2026/deploy/secondary-mac/docker-compose.yml)
- [`deploy/secondary-mac/deploy.sh`](/Users/yin/Documents/nzat-Jan2026/deploy/secondary-mac/deploy.sh)
- [`deploy/secondary-mac/env.example`](/Users/yin/Documents/nzat-Jan2026/deploy/secondary-mac/env.example)

The workflow uploads `docker-compose.yml`, `deploy.sh`, and `env.example` automatically.

You still need to keep `.env` on each server.

## Primary Linux .env

Start from:

- [`deploy/primary-linux/env.example`](/Users/yin/Documents/nzat-Jan2026/deploy/primary-linux/env.example)

Important values:

- `DB_CONN_STRING`: external shared database connection string
- `GHCR_USERNAME`: GHCR username that can pull the package
- `GHCR_TOKEN`: GHCR PAT with package read access
- `DOCKER_BIN`: optional, only if docker is not in PATH
- `CORS_ORIGINS`: include every browser origin that should call the API

Primary node defaults:

- `GMAIL_SYNC_ENABLED=true`
- `PO_FOLLOW_UP_ENABLED=true`
- `XERO_POLLING_ENABLED=true`

This node should remain the only background-job node unless you intentionally redesign job coordination.

## Secondary Mac .env

Start from:

- [`deploy/secondary-mac/env.example`](/Users/yin/Documents/nzat-Jan2026/deploy/secondary-mac/env.example)

Important values:

- `DB_CONN_STRING`: same external shared database as Linux
- `GHCR_USERNAME`: GHCR username that can pull the package
- `GHCR_TOKEN`: GHCR PAT with package read access
- `DOCKER_BIN`: optional, useful when Docker Desktop is not on PATH
- `CORS_ORIGINS`: include every browser origin that should call the API

Secondary node defaults:

- `GMAIL_SYNC_ENABLED=false`
- `PO_FOLLOW_UP_ENABLED=false`
- `XERO_POLLING_ENABLED=false`

This avoids duplicate background processing against the same database.

## First-Time Server Setup

Primary Linux:

```bash
mkdir -p /www/wwwroot/NZAT.NET
cp /www/wwwroot/NZAT.NET/env.example /www/wwwroot/NZAT.NET/.env || true
chmod +x /www/wwwroot/NZAT.NET/deploy.sh || true
```

Secondary Mac:

```bash
mkdir -p /Users/lynn/www/wwwroot/NZAT.NET
cp /Users/lynn/www/wwwroot/NZAT.NET/env.example /Users/lynn/www/wwwroot/NZAT.NET/.env || true
chmod +x /Users/lynn/www/wwwroot/NZAT.NET/deploy.sh || true
```

The `cp ... env.example ... .env` command only works after the workflow has uploaded files once. If this is the very first deploy, create `.env` manually or copy the example after the first workflow run.

## Post-Deploy Checks

On each machine:

```bash
cd <deploy-dir>
./deploy.sh
```

Then verify:

- `docker ps`
- `docker compose logs --tail=100`
- API responds on the expected port
- Web responds on the expected port

## Operational Risk

The API stores some generated files under `/app/App_Data`, including Gmail attachment cache and OCR preview files.

That means the two nodes share database state but do not share those local files. If requests for the same attachment bounce between nodes without sticky routing or shared object storage, one node may not have the other node's cached file yet.

Short-term practical options:

- Put the secondary node behind a different URL and use it mainly as a backup/manual node
- Use sticky routing at the proxy/load balancer
- Move attachment/OCR storage to shared storage later
