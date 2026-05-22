Place these files on the primary Linux server at:

`/www/wwwroot/NZAT.NET/`

This primary node keeps the Postgres and Redis containers locally. Postgres is exposed on port `5437` for the secondary node to use. It remains the only node that should run background jobs by default.

The GitHub Actions workflow uploads these files automatically on every deploy:

- `docker-compose.yml`
- `deploy.sh`
- `env.example`

You still need to create and maintain `.env` on the server.

Recommended first-time setup on the Linux server:

```bash
mkdir -p /www/wwwroot/NZAT.NET
cp /www/wwwroot/NZAT.NET/env.example /www/wwwroot/NZAT.NET/.env
chmod +x /www/wwwroot/NZAT.NET/deploy.sh
```

Fill the `.env` values before the first deploy.

Primary Linux defaults:

- `POSTGRES_PORT=5437`
- `DB_CONN_STRING=Host=db;Port=5432;...`
- `REDIS_CONN_STRING=redis:6379`

The primary API container connects to the local Redis container over the internal Docker network, so no host Redis install is required.

Secondary Mac should point its `DB_CONN_STRING` at the Linux server's public database endpoint, for example:

```dotenv
DB_CONN_STRING=Host=45.114.124.101;Port=5437;Database=nzat_demo;Username=nzat_demo_user;Password=change_this_to_a_strong_password
```
