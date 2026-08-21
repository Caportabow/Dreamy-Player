### First deploy (fresh machine)

```bash
# 1. Put real secrets in .env once
nano .env

# 2. Deploy: build images, start everything detached, then watch logs
./scripts/deploy.sh
```

That one command is equivalent to:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=50
```

You'll see the image build scroll by, then a table showing `nuxt`, `postgres`, `minio`, `download-worker`, `cloudflared` with `Up (healthy)` statuses, then a live log stream. **Ctrl+C only stops the log stream — the containers keep running.**

### Daily workflows

```bash
./scripts/deploy.sh up      # build + start detached, print status, return immediately
./scripts/deploy.sh ps      # are all containers Up/healthy?
./scripts/deploy.sh logs    # re-attach to the live log stream
./scripts/deploy.sh down    # stop everything (data volumes survive)
```

### Update after changing code

```bash
git pull
./scripts/deploy.sh up      # rebuilds the changed image and restarts it
```

### Watch just one service

```bash
./scripts/deploy.sh logs nuxt            # only the web app
./scripts/deploy.sh logs download-worker # only the download worker
```

### Rebuild only one service

```bash
./scripts/deploy.sh up nuxt              # rebuild + restart just nuxt
```

### Where to look when something's wrong

```bash
./scripts/deploy.sh ps                   # any service not "Up (healthy)"?
./scripts/deploy.sh logs nuxt            # migrations + server startup errors
./scripts/deploy.sh logs download-worker # yt-dlp/ffmpeg failures
```

One thing to remember: the `down` command keeps your data (it does **not** run `-v`), so `down` then `up` preserves everything. To wipe again you'd use the explicit `docker compose down -v` like before.
