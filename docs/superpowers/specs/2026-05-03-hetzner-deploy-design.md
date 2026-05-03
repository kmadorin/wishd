# Hetzner Deploy — wishd + keeperhub

Date: 2026-05-03
Status: Design approved, awaiting implementation plan

## Goal

Deploy wishd (Next.js) and keeperhub (Next.js + Postgres) to a single
Hetzner VPS, served over HTTPS at `wishd.simula.online` and
`kh.simula.online`. Minimal moving parts. Lifetime: live demo / portfolio
(weeks-to-months), single user load, ongoing iteration.

## Non-goals

- HA, multi-region, autoscaling.
- Real SQS, Redis, executor, dispatcher, event-tracker, block-dispatcher,
  sandbox, reaper. Not exercised by demo (MCP + direct execution only).
- CI/CD pipelines. Manual SSH deploy.
- Off-box backup destination (local rotation only; can add later).
- Sentry, analytics, paid monitoring.

## Architecture

Single Hetzner CX22 (Falkenstein, DE), Ubuntu 24.04 LTS.

```
                    Internet
                       │
                  Hetzner box
                       │
                ┌──────▼──────┐
                │   Caddy     │  :80/:443  (auto-TLS Let's Encrypt)
                │ (host pkg)  │
                └──┬──────┬───┘
   wishd.simula.online│      │kh.simula.online
        ┌──────────▼┐    ┌▼────────────┐
        │ wishd-web │    │ keeperhub   │   (Docker, simula-net)
        │ next start│    │ next start  │
        │  :3000    │    │  :3000      │
        └─────┬─────┘    └──────┬──────┘
              │ http://keeperhub:3000
              └────────►────────┤
                                │
                          ┌─────▼──────┐
                          │ postgres16 │   (Docker, bind mount)
                          │   :5432    │
                          └────────────┘
```

- Caddy on host (apt). Reverse-proxies to two containers on
  `127.0.0.1:3001` (wishd) and `127.0.0.1:3002` (keeperhub).
- Two repos cloned to `/srv/wishd` and `/srv/keeperhub`. Each has its own
  `docker-compose.prod.yml`.
- External Docker network `simula-net` shared by both stacks so
  `wishd-web` reaches `keeperhub` by service name.
- Postgres in Docker, bind-mounted volume. No host port exposure.

## Resource sizing

CX22: 2 vCPU / 4 GB RAM / 40 GB SSD / ~€4.5/mo.

| Component       | Idle RAM |
|-----------------|---------:|
| postgres        |    ~150M |
| keeperhub-app   |    ~400M |
| wishd-web       |    ~400M |
| caddy           |     ~30M |
| OS + buffer     |    ~500M |
| **headroom**    |   ~2.5 G |

Build-time RAM (Next.js prod build) can spike >2 GB. Mitigation: 4 GB
swap file (`fallocate -l 4G /swapfile`). If chronic OOM, upgrade to CX32
(4 vCPU / 8 GB / ~€7/mo).

## DNS

In simula.online registrar, add:

```
A    wishd.simula.online   → <hetzner-ipv4>
A    kh.simula.online    → <hetzner-ipv4>
AAAA wishd.simula.online   → <hetzner-ipv6>   (optional)
AAAA kh.simula.online    → <hetzner-ipv6>   (optional)
```

## TLS — Caddy

`/etc/caddy/Caddyfile`:

```caddy
wishd.simula.online {
    reverse_proxy 127.0.0.1:3001
    encode zstd gzip
}

kh.simula.online {
    reverse_proxy 127.0.0.1:3002
    encode zstd gzip
}
```

Caddy handles ACME issuance + renewal automatically.

## Filesystem layout (on box)

```
/srv/
├── keeperhub/                # git clone
│   ├── docker-compose.prod.yml   # NEW (slim)
│   ├── .env                      # gitignored, scp'd
│   └── data/pg/                  # postgres bind mount
├── wishd/                    # git clone
│   ├── docker-compose.prod.yml   # NEW
│   ├── Dockerfile                # NEW (wishd has none today)
│   └── .env                      # gitignored
├── deploy-kh.sh
├── deploy-wishd.sh
└── backups/pg/               # daily pg_dump, 7-day rotation
```

## New files in repos

### 1. `wishd/Dockerfile` (new)

Multi-stage, builds `apps/web` from monorepo.

```dockerfile
FROM node:22-alpine AS deps
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY plugins plugins
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter web build

FROM node:22-alpine AS runner
RUN npm i -g pnpm@9
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start", "-H", "0.0.0.0"]
```

Note: builder stage copies entire monorepo because plugins are workspace
deps. Image is large; acceptable for hackathon scale.

### 2. `wishd/docker-compose.prod.yml` (new)

```yaml
services:
  web:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3000"
    env_file: .env
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

networks:
  default:
    name: simula-net
    external: true
```

### 3. `keeperhub/docker-compose.prod.yml` (new — slim)

Only `db` + `app` + one-shot `migrator`. No localstack, redis, executor,
dispatcher, sandbox, event-tracker, block-dispatcher, reaper.

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: keeperhub
    volumes:
      - ./data/pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
    restart: unless-stopped
    ports:
      - "127.0.0.1:3002:3000"
    env_file: .env
    depends_on:
      db: { condition: service_healthy }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  migrator:
    build:
      context: .
      dockerfile: Dockerfile
      target: migrator
    env_file: .env
    depends_on:
      db: { condition: service_healthy }
    command: pnpm db:migrate
    profiles: [migrate]

networks:
  default:
    name: simula-net
    external: true
```

## Env files

### `/srv/keeperhub/.env`

```
POSTGRES_PASSWORD=<openssl rand -hex 16>
DATABASE_URL=postgresql://postgres:<pw>@db:5432/keeperhub
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=https://kh.simula.online
KEEPERHUB_API_KEY=<openssl rand -hex 32>
INTEGRATION_ENCRYPTION_KEY=<openssl rand -hex 32>
NEXT_PUBLIC_AUTH_PROVIDERS=email
NEXT_PUBLIC_BILLING_ENABLED=false
NEXT_PUBLIC_GAS_SPONSORSHIP_ENABLED=false
NODE_ENV=production
HOSTNAME=0.0.0.0
```

Excluded (per Q&A): OPENAI_API_KEY, PIMLICO_*, GitHub/Google OAuth keys,
Sentry DSN, LocalStack token.

### `/srv/wishd/.env`

```
ANTHROPIC_API_KEY=<your key>
KH_BASE_URL=http://keeperhub:3000
NEXT_PUBLIC_KH_BASE_URL=https://kh.simula.online
KH_ACCESS_TOKEN=<same value as KEEPERHUB_API_KEY>
WISHD_APP_URL=https://wishd.simula.online
UNISWAP_API_KEY=<your key>
RPC_URL_1=...
RPC_URL_8453=...
RPC_URL_42161=...
RPC_URL_10=...
RPC_URL_137=...
RPC_URL_130=...
RPC_URL_11155111=...
NODE_ENV=production
```

`KH_BASE_URL` = container DNS for server-to-server. Browser-side calls
(if any) use `NEXT_PUBLIC_KH_BASE_URL`.

## kh-auth (wishd OAuths into KH)

Per Q4 = yes. Wishd's `apps/web/server/keepers/khOAuth.ts` flow needs:

- KH side: register redirect URI `https://wishd.simula.online/api/keepers/kh-callback`
  in whatever KH config governs allowed callbacks (TBD: locate the
  setting in keeperhub repo during implementation; likely
  `BETTER_AUTH_URL` plus an allowlist or a per-client config).
- Wishd side: env already covered (`KH_BASE_URL`,
  `NEXT_PUBLIC_KH_BASE_URL`, `KH_ACCESS_TOKEN`, `WISHD_APP_URL`).

## Deploy procedure

One-shot box bootstrap (run once, by hand):

1. `apt update && apt install -y caddy docker.io docker-compose-plugin git ufw`
2. `ufw allow 22/tcp 80/tcp 443/tcp && ufw enable`
3. `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
   (persist in `/etc/fstab`).
4. Harden ssh: key-only, `PasswordAuthentication no`.
5. `docker network create simula-net`
6. `mkdir -p /srv/keeperhub /srv/wishd /srv/backups/pg`
7. `git clone <kh-repo> /srv/keeperhub`
8. `git clone <wishd-repo> /srv/wishd`
9. scp `.env` files into place (chmod 600).
10. Drop `/etc/caddy/Caddyfile` from above + `systemctl reload caddy`.
11. First deploy: run `deploy-kh.sh` then `deploy-wishd.sh`.
12. Install daily backup cron (see below).

`/srv/deploy-kh.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/keeperhub
git pull
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrator
docker compose -f docker-compose.prod.yml up -d --build app db
docker image prune -f
```

`/srv/deploy-wishd.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/wishd
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
```

Per-deploy: SSH in, run the relevant script. ~2 min each.

## Backups

`/etc/cron.daily/pg-backup`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec $(docker ps -qf name=keeperhub-db-1) \
  pg_dump -U postgres -d keeperhub -F c \
  > /srv/backups/pg/keeperhub-$TS.dump
find /srv/backups/pg -name "keeperhub-*.dump" -mtime +7 -delete
```

Restore: `docker exec -i <db-container> pg_restore -U postgres -d keeperhub --clean < dump`.

Off-box destination (S3 / Hetzner Storage Box) is out of scope; revisit
if data matters more later.

## Firewall + SSH

```
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

`/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`
(create non-root sudo user first).

## Observability

- `docker compose logs -f <service>` for ad-hoc debugging.
- Docker `json-file` driver capped at 30 MB per service (3 × 10 MB).
- No Sentry (per Q7).
- Optional: UptimeRobot free pinging `https://kh.simula.online/api/health`
  and `https://wishd.simula.online`. Out of scope for v1.

## Risks

- **Build OOM** on CX22. Mitigated by swap; fallback CX32.
- **Wishd Dockerfile copies whole monorepo** → image ~1–2 GB. Acceptable
  for one-box deploy. Optimize later (standalone output, multi-stage
  trim) if it becomes painful.
- **Postgres data loss** if disk dies before off-box backups added.
  Daily local dump rotated 7 days = recoverable from box snapshot only.
  Hetzner snapshot feature (paid extra) recommended for the demo
  window.
- **Single point of failure**: one box. Acceptable per non-goals.
- **kh-auth callback config**: exact setting in keeperhub repo for
  registering allowed redirect URIs is not yet pinpointed — needs lookup
  during implementation. Likely surfaces during first OAuth attempt.

## Out-of-scope (parking lot)

- CI/CD via GitHub Actions.
- Off-box backups.
- Multi-region / HA.
- Real SQS, Redis, executor, dispatcher, event-tracker stack.
- Sentry, analytics.
- Vercel split deploy (revisit if preview deploys become valuable).

## Open items resolved

| # | Question | Answer |
|---|---|---|
| 1 | Auth providers | email-only |
| 2 | OPENAI_API_KEY | not needed |
| 3 | Pimlico / EIP-7702 | not needed |
| 4 | Wishd OAuths into KH | yes |
| 5 | Hetzner region | Falkenstein (EU) |
| 6 | Add Dockerfile to wishd | yes |
| 7 | Sentry | skip |
