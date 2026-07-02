# 找钥匙功能换电脑部署说明

这份文档用于把“找钥匙 / 灯条绑定 / eStation 基站 MQTT 通信”部署到另一台电脑。当前系统由这些服务组成：

| 服务 | 作用 | 默认端口 |
|---|---|---|
| `web` | 前端页面，包含“找钥匙”和 Device Communication | `5173`，生产 Linux 示例为 `8513` |
| `api` | .NET 后台，处理绑定、找灯、MQTT 监听 | `8080`，生产 Linux 示例为 `8013` |
| `db` | PostgreSQL 数据库，保存工单、绑定、基站和灯条状态 | `5432`，生产 Linux 示例为 `5437` |
| `redis` | 后台缓存和任务状态 | 容器内部使用 |
| `emqx` | MQTT Broker，基站连接到这里 | `1883` |
| `emqx dashboard` | MQTT 管理后台 | `18083` |

## 先决定部署方式

### 方式 A：新电脑完全替代旧电脑

使用这一种时，新电脑运行 `web`、`api`、`db`、`redis`、`emqx`。基站 MQTT Server 要改成新电脑的 IP。旧电脑停用前要备份并恢复 PostgreSQL 数据。

推荐使用：

```text
deploy/primary-linux/
```

适合 Linux 服务器，也适合把新电脑当作唯一主机。

### 方式 B：新电脑只是第二台运行电脑

使用这一种时，新电脑运行 `web`、`api`、`redis`、`emqx`，但数据库继续连旧 Linux 主机。注意：基站只需要连一个 MQTT Broker。不要让旧电脑和新电脑同时都接同一批基站，否则状态会分裂。

推荐使用：

```text
deploy/secondary-mac/
```

适合 Mac 作为第二节点。

如果只是为了“找钥匙”稳定使用，现场最清晰的做法是方式 A：让新电脑成为唯一 Broker 和唯一 API。

## 新电脑需要安装什么

### Linux

安装 Docker、Docker Compose、CUPS：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg cups
```

按 Docker 官方方式安装 Docker Engine 后，确认：

```bash
docker --version
docker compose version
sudo systemctl enable --now docker
sudo systemctl enable --now cups
```

如果服务器有防火墙，放行这些端口：

```bash
sudo ufw allow 8513/tcp
sudo ufw allow 8013/tcp
sudo ufw allow 1883/tcp
sudo ufw allow 18083/tcp
```

如果你使用根目录 `docker-compose.yml` 的默认端口，则放行 `5173`、`8080`、`1883`、`18083`。

### macOS

安装 Docker Desktop，并保持 Docker Desktop 正在运行。确认：

```bash
docker --version
docker compose version
```

如果部署脚本由 `lynn` 用户执行，但 Docker Desktop 在另一个 macOS 用户下运行，需要在 `.env` 设置：

```dotenv
DOCKER_RUN_AS_USER=eric
```

并按 `deploy/secondary-mac/README.md` 配好 sudo 权限。

## 准备部署目录

### Linux 主机

```bash
sudo mkdir -p /www/wwwroot/NZAT.NET
sudo chown -R "$USER":"$USER" /www/wwwroot/NZAT.NET
cp deploy/primary-linux/docker-compose.yml /www/wwwroot/NZAT.NET/docker-compose.yml
cp deploy/primary-linux/deploy.sh /www/wwwroot/NZAT.NET/deploy.sh
cp deploy/primary-linux/env.example /www/wwwroot/NZAT.NET/.env
chmod +x /www/wwwroot/NZAT.NET/deploy.sh
```

### Mac 主机

```bash
mkdir -p /Users/lynn/www/wwwroot/NZAT.NET
cp deploy/secondary-mac/docker-compose.yml /Users/lynn/www/wwwroot/NZAT.NET/docker-compose.yml
cp deploy/secondary-mac/deploy.sh /Users/lynn/www/wwwroot/NZAT.NET/deploy.sh
cp deploy/secondary-mac/env.example /Users/lynn/www/wwwroot/NZAT.NET/.env
chmod +x /Users/lynn/www/wwwroot/NZAT.NET/deploy.sh
```

## 配置 `.env`

打开新电脑部署目录里的 `.env`。

### 必须改的基础项

```dotenv
ASPNETCORE_ENVIRONMENT=Production

API_PORT=8013
WEB_PORT=8513
MQTT_PORT=1883
EMQX_DASHBOARD_PORT=18083

EMQX_DASHBOARD_USERNAME=admin
EMQX_DASHBOARD_PASSWORD=请改成强密码

GHCR_USERNAME=你的 GitHub 或 GHCR 用户名
GHCR_TOKEN=你的 GHCR token
```

当前部署脚本会从 `ghcr.io/lynn61liu/nzat-api:latest` 和 `ghcr.io/lynn61liu/nzat-web:latest` 拉镜像，所以 `GHCR_USERNAME` 和 `GHCR_TOKEN` 必须有读取镜像权限。

### 完整替换旧电脑时的数据库配置

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=请改成数据库密码
POSTGRES_DB=workshop
POSTGRES_PORT=5437

DB_CONN_STRING=Host=db;Port=5432;Database=workshop;Username=postgres;Password=同上数据库密码
REDIS_CONN_STRING=redis:6379
```

注意：`POSTGRES_PORT=5437` 是宿主机对外端口，`DB_CONN_STRING` 在容器内部连接数据库，所以端口仍然写 `5432`。

### 第二台电脑共用旧数据库时的数据库配置

```dotenv
DB_CONN_STRING=Host=旧数据库服务器IP;Port=5437;Database=workshop;Username=postgres;Password=旧数据库密码
REDIS_CONN_STRING=redis:6379
```

这种方式下，新电脑不会运行本地 Postgres。确保旧数据库服务器防火墙允许新电脑访问 `5437`。

## 开启找钥匙 MQTT 功能

`.env` 必须把 eStation MQTT 打开：

```dotenv
ESTATION_MQTT_ENABLED=true
ESTATION_MQTT_BROKER_HOST=emqx
ESTATION_MQTT_BROKER_PORT=1883
ESTATION_MQTT_USERNAME=
ESTATION_MQTT_PASSWORD=
ESTATION_MQTT_USE_TLS=false
```

这里 `ESTATION_MQTT_BROKER_HOST=emqx` 是给 API 容器用的。因为 API 和 EMQX 在同一个 Docker Compose 网络里，API 连接 Broker 时用服务名 `emqx`，不要写宿主机 IP。

如果以后给 EMQX 开 MQTT 用户名密码，再同步填写：

```dotenv
ESTATION_MQTT_USERNAME=基站和API共同使用的MQTT用户名
ESTATION_MQTT_PASSWORD=对应密码
```

当前 compose 文件只设置了 EMQX Dashboard 登录密码，没有单独配置 MQTT 客户端认证。默认现场配置可以先让基站和 API 匿名连接到 `1883`。

## 运行

### 用部署脚本运行

Linux：

```bash
cd /www/wwwroot/NZAT.NET
./deploy.sh
```

Mac：

```bash
cd /Users/lynn/www/wwwroot/NZAT.NET
./deploy.sh
```

脚本会执行：

```bash
docker login ghcr.io
docker compose pull
docker compose up -d --remove-orphans
```

### 手动运行

如果不用部署脚本：

```bash
cd /www/wwwroot/NZAT.NET
docker login ghcr.io
docker compose pull
docker compose up -d --remove-orphans
```

查看容器：

```bash
docker compose ps
```

查看 API 日志：

```bash
docker compose logs -f api
```

看到类似下面日志，说明 API 已经连上 MQTT Broker：

```text
Connected to eStation MQTT broker emqx:1883.
```

如果看到：

```text
eStation MQTT listener is disabled.
```

说明 `.env` 里 `ESTATION_MQTT_ENABLED` 还不是 `true`，改完后重启：

```bash
docker compose up -d api
```

## 旧电脑数据库迁移

完整替换旧电脑时，先在旧电脑备份：

```bash
cd /www/wwwroot/NZAT.NET
docker compose exec -T db pg_dump -U postgres -d workshop -Fc > workshop.dump
```

把 `workshop.dump` 复制到新电脑部署目录。新电脑先启动数据库：

```bash
cd /www/wwwroot/NZAT.NET
docker compose up -d db
```

恢复数据：

```bash
docker compose exec -T db pg_restore -U postgres -d workshop --clean --if-exists < workshop.dump
```

恢复完成后再启动全部服务：

```bash
docker compose up -d --remove-orphans
```

如果数据库用户名、数据库名不是 `postgres` / `workshop`，把命令里的值换成 `.env` 里的实际值。

## 基站 MQTT Server 如何配置

在 eStation 基站配置页面，把 MQTT Server 指向新电脑的局域网 IP 或固定域名。

推荐配置：

| 项 | 值 |
|---|---|
| MQTT Server / Host | 新电脑 IP，例如 `192.168.1.50` |
| MQTT Port | `1883` |
| Username | 留空，除非你已给 EMQX 配 MQTT 用户 |
| Password | 留空，除非你已给 EMQX 配 MQTT 密码 |
| TLS / SSL | `false` / 关闭 |
| Client ID | 可留默认，或使用基站默认 SN |

不要把基站 MQTT Server 配成 `emqx`。`emqx` 只在 Docker 内部可用，基站必须填它能访问到的新电脑 IP 或域名。

基站连接成功后，它会向这些 topic 发消息：

```text
/estation/{StationId}/heartbeat
/estation/{StationId}/result
```

后台会向这些 topic 发指令：

```text
/estation/{StationId}/bind
/estation/{StationId}/task
```

基站 ID 当前要求格式：

```text
90A9F + 7 位十六进制字符
```

灯条 ID 当前要求格式：

```text
AD1 + 9 位十六进制字符
```

## 验证步骤

下面命令里的 `8013` 使用的是生产 Linux 示例端口。如果你的 `.env` 里 `API_PORT` 是 `8080` 或其他值，把命令里的端口替换成实际值。

1. 打开 EMQX Dashboard：

   ```text
   http://新电脑IP:18083
   ```

   用 `.env` 的 `EMQX_DASHBOARD_USERNAME` 和 `EMQX_DASHBOARD_PASSWORD` 登录。确认 Clients 里能看到 eStation 基站在线。

2. 打开前端：

   ```text
   http://新电脑IP:8513
   ```

   如果使用默认根目录 compose，则是：

   ```text
   http://新电脑IP:5173
   ```

3. 检查 MQTT 健康接口：

   ```bash
   curl http://新电脑IP:8013/api/estation/mqtt-health
   ```

   正常应该看到：

   ```json
   {
     "enabled": true,
     "brokerHost": "emqx",
     "brokerPort": 1883,
     "useTls": false
   }
   ```

4. 检查基站列表：

   ```bash
   curl http://新电脑IP:8013/api/estation/stations
   ```

   收到 heartbeat 后，页面 `Device Communication / Base Stations` 应该出现基站。

5. 检查绑定列表：

   ```bash
   curl http://新电脑IP:8013/api/estation/light-bindings
   ```

   已绑定的灯条会在“找钥匙”页面出现。

6. 在“找钥匙”页面点亮灯条。后台会发布 `/estation/{StationId}/task`，灯条应亮红色并蜂鸣。

## 常见问题

### 找钥匙页面为空

先确认是否已有绑定：

```bash
curl http://新电脑IP:8013/api/estation/light-bindings
```

如果返回空数组，需要先在工单里绑定灯条，或者在 Device Communication 页面手动绑定物体和灯条。

### 页面提示 MQTT listener disabled

检查 `.env`：

```dotenv
ESTATION_MQTT_ENABLED=true
```

改完重启 API：

```bash
docker compose up -d api
```

### 绑定时报“没有在线基站”

说明后台还没有收到任何在线基站 heartbeat。检查：

1. 基站 MQTT Server 是否填了新电脑 IP。
2. 新电脑防火墙是否放行 `1883`。
3. EMQX Dashboard 是否能看到基站 client。
4. API 是否已经连接 Broker。

```bash
docker compose logs --tail=100 api
```

### 绑定后 30 秒变成 BindFailed

后台已经发布 `/bind`，但 30 秒内没有收到基站 `/result` 确认。检查：

1. 基站是否支持 `/estation/{StationId}/bind` 指令。
2. 灯条 ID 是否正确，格式是否为 `AD1` 开头。
3. 基站和灯条是否在射频范围内。
4. `Device Communication / MQTT Logs` 是否有 result 消息。

### 点亮失败，提示 MQTT 发布失败

API 发布 `/task` 失败。检查：

```bash
docker compose logs --tail=100 api
docker compose ps emqx
```

确认 `.env` 里的 `ESTATION_MQTT_BROKER_HOST=emqx`、`ESTATION_MQTT_BROKER_PORT=1883`。

### EMQX Dashboard 能打开，但基站连不上

Dashboard 端口是 `18083`，基站用的是 MQTT 端口 `1883`。确认基站配置的是 `1883`，不是 `18083`。

### 多台电脑同时运行

同一批基站只连接一台 MQTT Broker。现场建议：

```text
基站 -> 当前主电脑 EMQX -> 当前主电脑 API -> 数据库
```

如果要切换到新电脑，先把基站 MQTT Server 改成新电脑 IP，再停掉旧电脑的 API 或旧 EMQX，避免两边都在处理状态。

## 运行中的日常命令

查看服务：

```bash
docker compose ps
```

重启 API：

```bash
docker compose restart api
```

重启 EMQX：

```bash
docker compose restart emqx
```

查看 API 日志：

```bash
docker compose logs -f api
```

查看 EMQX 日志：

```bash
docker compose logs -f emqx
```

停止服务：

```bash
docker compose down
```

不要随便执行下面命令，它会删除数据库数据：

```bash
docker compose down -v
```
