Place these files on the secondary Mac at:

`/Users/lynn/www/wwwroot/NZAT.NET/`

The secondary node is intended to share the same database as the primary node, but it should not run background jobs. It runs its own local Redis container for cache storage.

The GitHub Actions workflow uploads these files automatically on every deploy:

- `docker-compose.yml`
- `deploy.sh`
- `env.example`

You still need to create and maintain `.env` on the Mac.

Prerequisite on the Mac:

- Install Docker Desktop, or install a Docker CLI that includes `docker compose`
- If you use standalone Homebrew `docker-compose`, make sure it exists under `/opt/homebrew/bin/docker-compose` or `/usr/local/bin/docker-compose`
- If Docker Desktop is running under a different macOS user, set `DOCKER_RUN_AS_USER` in `.env` and allow the deploy user to run docker via `sudo -u <that-user>`

Recommended copy steps on the Mac:

```bash
mkdir -p /Users/lynn/www/wwwroot/NZAT.NET
```

Recommended first-time setup on the Mac:

```bash
cp /Users/lynn/www/wwwroot/NZAT.NET/env.example /Users/lynn/www/wwwroot/NZAT.NET/.env
chmod +x /Users/lynn/www/wwwroot/NZAT.NET/deploy.sh
```

The `.env` values must be filled in before first deploy.

Secondary Mac defaults:

- `DB_CONN_STRING=Host=YOUR_DB_HOST;Port=5432;...`
- `REDIS_CONN_STRING=redis:6379`
- Optional: `DOCKER_RUN_AS_USER=eric` when deploy is triggered by `lynn` but Docker Desktop is running in `eric`'s session

If you use `DOCKER_RUN_AS_USER`, the deploy user must be able to execute docker as that user. Example `sudoers` entry:

```text
lynn ALL=(eric) NOPASSWD: /opt/homebrew/bin/docker, /usr/local/bin/docker, /Applications/Docker.app/Contents/Resources/bin/docker
```

The secondary API container connects to the local Redis container over the internal Docker network, so no host Redis install is required on the Mac.
