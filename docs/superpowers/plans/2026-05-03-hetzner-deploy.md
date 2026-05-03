# Hetzner Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `wishd.simula.online` and `kh.simula.online` on a single Hetzner CX22 (Falkenstein, Ubuntu 24.04) running wishd + keeperhub + postgres in Docker, fronted by Caddy with auto-TLS.

**Architecture:** Two Docker compose stacks (`/srv/keeperhub`, `/srv/wishd`) on shared external network `simula-net`. Postgres bind-mounted. Caddy on host reverse-proxies to `127.0.0.1:3001` (wishd) and `127.0.0.1:3002` (keeperhub). Manual SSH deploy via two scripts.

**Tech Stack:** Ubuntu 24.04, Docker + Compose plugin, Caddy 2, Postgres 16, Node 22 (wishd) / Node 24 (keeperhub), pnpm 9.

**Spec:** `docs/superpowers/specs/2026-05-03-hetzner-deploy-design.md`

**Assumed pre-conditions (user does these before plan starts):**

- Hetzner CX22 provisioned, Ubuntu 24.04 LTS, plan executor SSH'd in as `root` (or sudo user).
- Repos already cloned to `/srv/keeperhub` and `/srv/wishd` (user states they will clone themselves — plan does not perform git clone or manage GitHub auth).
- Domain `simula.online` controlled by user; DNS records will be added during Task 5.

---

## Pre-flight: ask user for inputs

Before Task 1, the executing agent MUST collect these from the user. Do not proceed until all are supplied. Use a single batched question. Treat empty values as blockers.

```
INPUTS NEEDED FROM USER:

# Box / network
1.  HETZNER_IPV4               — public IPv4 of the box
2.  HETZNER_IPV6               — public IPv6, or "none"

# Secrets the agent CANNOT generate
3.  ANTHROPIC_API_KEY          — for wishd
4.  UNISWAP_API_KEY            — for wishd
5.  RPC_URL_1                  — Ethereum mainnet RPC
6.  RPC_URL_8453               — Base
7.  RPC_URL_42161              — Arbitrum One
8.  RPC_URL_10                 — Optimism
9.  RPC_URL_137                — Polygon
10. RPC_URL_130                — Unichain
11. RPC_URL_11155111           — Sepolia

# Optional confirmation
12. Region confirmed Falkenstein? (y/n)
13. Subdomains confirmed: wishd.simula.online + kh.simula.online? (y/n)
```

The agent will GENERATE these locally (do NOT ask user):

- `POSTGRES_PASSWORD` — `openssl rand -hex 16`
- `BETTER_AUTH_SECRET` — `openssl rand -hex 32`
- `KEEPERHUB_API_KEY` — `openssl rand -hex 32` (also used as `KH_ACCESS_TOKEN` in wishd)
- `INTEGRATION_ENCRYPTION_KEY` — `openssl rand -hex 32`

Save the generated secrets to `/root/.simula-secrets.txt` (chmod 600) so the user can recover them later.

---

## File map

Files the plan creates **on the box** (not committed to either repo):

| Path | Purpose |
|---|---|
| `/srv/keeperhub/docker-compose.prod.yml` | Slim compose: db + app + migrator |
| `/srv/keeperhub/.env` | KH runtime env (secrets) |
| `/srv/wishd/Dockerfile` | Multi-stage build for wishd Next.js app |
| `/srv/wishd/docker-compose.prod.yml` | Single-service compose for wishd-web |
| `/srv/wishd/.env` | Wishd runtime env (secrets) |
| `/etc/caddy/Caddyfile` | TLS + reverse proxy config |
| `/srv/deploy-kh.sh` | Pull + migrate + rebuild keeperhub |
| `/srv/deploy-wishd.sh` | Pull + rebuild wishd |
| `/etc/cron.daily/pg-backup` | Daily pg_dump rotation |
| `/etc/fstab` | Persist swap |
| `/root/.simula-secrets.txt` | Record of generated secrets |

These files are NOT in either git repo; they live only on the box. Future improvement: commit upstream so they survive a re-provision.

---

## Task 1: System update + base packages

**Files:** none (apt only)

- [ ] **Step 1: Update apt index + upgrade**

```bash
apt update && apt upgrade -y
```

- [ ] **Step 2: Install base packages**

```bash
apt install -y \
  ca-certificates curl gnupg ufw cron \
  docker.io docker-compose-plugin \
  debian-keyring debian-archive-keyring apt-transport-https
```

- [ ] **Step 3: Install Caddy from official repo**

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

- [ ] **Step 4: Verify versions**

```bash
docker --version       # expect: Docker version 24+ or 26+
docker compose version # expect: Docker Compose version v2.x
caddy version          # expect: v2.x
```

All three commands must succeed. If `docker compose` fails, install `docker-compose-plugin` again or fall back to upstream Docker repo.

- [ ] **Step 5: Enable + start docker**

```bash
systemctl enable --now docker
systemctl status docker --no-pager | head -5   # expect: active (running)
```

---

## Task 2: Add 4 GB swap

**Files:**
- Create: `/swapfile`
- Modify: `/etc/fstab`

- [ ] **Step 1: Create swapfile**

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

- [ ] **Step 2: Persist across reboots**

Append to `/etc/fstab` (only if not already present):

```bash
grep -q '^/swapfile ' /etc/fstab || \
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

- [ ] **Step 3: Verify**

```bash
swapon --show           # expect: /swapfile  file  4G
free -h                 # expect: Swap: 4.0Gi total
```

---

## Task 3: Firewall (ufw)

**Files:** none (ufw state)

- [ ] **Step 1: Configure rules**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
```

- [ ] **Step 2: Enable**

```bash
ufw --force enable
```

- [ ] **Step 3: Verify**

```bash
ufw status verbose
# Expect rules: 22/tcp ALLOW, 80/tcp ALLOW, 443/tcp ALLOW
# Status: active
```

---

## Task 4: SSH hardening

**Files:** Modify `/etc/ssh/sshd_config`

- [ ] **Step 1: Disable password auth**

```bash
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
```

(`prohibit-password` allows root login by SSH key only, blocks password.)

- [ ] **Step 2: Validate config syntax**

```bash
sshd -t   # expect: no output, exit 0
```

- [ ] **Step 3: Reload sshd**

```bash
systemctl reload ssh
```

- [ ] **Step 4: Verify (do NOT close current session yet)**

```bash
grep -E '^(PasswordAuthentication|PermitRootLogin)' /etc/ssh/sshd_config
# Expect:
# PermitRootLogin prohibit-password
# PasswordAuthentication no
```

Open a second SSH session in another terminal to confirm key auth still works before closing the original.

---

## Task 5: DNS

**Files:** none (action is in user's DNS provider UI)

- [ ] **Step 1: Ask user to add DNS records**

Ask the user to add the following records at their `simula.online` registrar, then confirm "done":

```
A     wishd.simula.online   → <HETZNER_IPV4>
A     kh.simula.online      → <HETZNER_IPV4>
AAAA  wishd.simula.online   → <HETZNER_IPV6>   (optional, only if box has v6)
AAAA  kh.simula.online      → <HETZNER_IPV6>   (optional)
```

- [ ] **Step 2: Wait for propagation + verify**

```bash
for h in wishd.simula.online kh.simula.online; do
  echo "=== $h ==="
  dig +short A $h
done
```

Both must return `<HETZNER_IPV4>`. If either returns nothing or wrong IP, wait 60s and retry. Do not proceed until both resolve correctly.

---

## Task 6: Docker network

**Files:** none

- [ ] **Step 1: Create shared network**

```bash
docker network create simula-net 2>/dev/null || true
```

- [ ] **Step 2: Verify**

```bash
docker network inspect simula-net --format '{{.Name}} {{.Driver}}'
# Expect: simula-net bridge
```

---

## Task 7: Generate secrets

**Files:** Create `/root/.simula-secrets.txt`

- [ ] **Step 1: Generate**

```bash
umask 077
cat > /root/.simula-secrets.txt <<EOF
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
KEEPERHUB_API_KEY=$(openssl rand -hex 32)
INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
chmod 600 /root/.simula-secrets.txt
```

- [ ] **Step 2: Source for use in later tasks**

```bash
set -a; . /root/.simula-secrets.txt; set +a
echo "POSTGRES_PASSWORD set: ${POSTGRES_PASSWORD:0:6}…"
echo "KEEPERHUB_API_KEY set: ${KEEPERHUB_API_KEY:0:6}…"
```

If any variable is empty, regenerate.

---

## Task 8: Write keeperhub `docker-compose.prod.yml`

**Files:** Create `/srv/keeperhub/docker-compose.prod.yml`

- [ ] **Step 1: Verify keeperhub repo present**

```bash
test -f /srv/keeperhub/Dockerfile && echo OK || echo "MISSING — clone first"
test -f /srv/keeperhub/package.json && echo OK || echo "MISSING"
```

Both must print `OK`. If not, stop — user said they would clone; ask them to fix.

- [ ] **Step 2: Write the file**

```bash
cat > /srv/keeperhub/docker-compose.prod.yml <<'YAML'
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
    networks:
      default:
        aliases:
          - keeperhub
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
YAML
```

- [ ] **Step 3: Validate compose syntax**

```bash
cd /srv/keeperhub
docker compose -f docker-compose.prod.yml config > /dev/null && echo OK
```

`OK` expected. Errors → fix the heredoc indentation.

---

## Task 9: Write keeperhub `.env`

**Files:** Create `/srv/keeperhub/.env`

- [ ] **Step 1: Write env**

```bash
set -a; . /root/.simula-secrets.txt; set +a
umask 077
cat > /srv/keeperhub/.env <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/keeperhub
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=https://kh.simula.online
KEEPERHUB_API_KEY=${KEEPERHUB_API_KEY}
INTEGRATION_ENCRYPTION_KEY=${INTEGRATION_ENCRYPTION_KEY}
NEXT_PUBLIC_AUTH_PROVIDERS=email
NEXT_PUBLIC_BILLING_ENABLED=false
NEXT_PUBLIC_GAS_SPONSORSHIP_ENABLED=false
NODE_ENV=production
HOSTNAME=0.0.0.0
EOF
chmod 600 /srv/keeperhub/.env
```

- [ ] **Step 2: Verify keys**

```bash
grep -cE '^[A-Z_]+=' /srv/keeperhub/.env
# Expect: 11
```

---

## Task 10: Write wishd `Dockerfile`

**Files:** Create `/srv/wishd/Dockerfile`

- [ ] **Step 1: Verify wishd repo present**

```bash
test -f /srv/wishd/pnpm-workspace.yaml && echo OK || echo "MISSING"
test -d /srv/wishd/apps/web && echo OK || echo "MISSING"
```

Both must print `OK`.

- [ ] **Step 2: Write the Dockerfile**

```bash
cat > /srv/wishd/Dockerfile <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY plugins plugins
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter web build

FROM node:22-alpine AS runner
RUN npm i -g pnpm@9
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start", "-H", "0.0.0.0"]
DOCKERFILE
```

- [ ] **Step 3: Confirm pnpm lockfile version is v9-compatible**

```bash
head -1 /srv/wishd/pnpm-lock.yaml
# Expect: lockfileVersion: '9.0' (or similar)
```

If lockfile is older (e.g. 6.0), bump pnpm version in the Dockerfile to match the version that produced the lockfile.

---

## Task 11: Write wishd `docker-compose.prod.yml`

**Files:** Create `/srv/wishd/docker-compose.prod.yml`

- [ ] **Step 1: Write the file**

```bash
cat > /srv/wishd/docker-compose.prod.yml <<'YAML'
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
YAML
```

- [ ] **Step 2: Validate**

```bash
cd /srv/wishd
docker compose -f docker-compose.prod.yml config > /dev/null && echo OK
```

---

## Task 12: Write wishd `.env`

**Files:** Create `/srv/wishd/.env`

- [ ] **Step 1: Write env (uses values collected in pre-flight)**

Substitute the user-supplied values inline. ANTHROPIC_API_KEY, UNISWAP_API_KEY, all RPC_URL_* come from pre-flight inputs.

```bash
set -a; . /root/.simula-secrets.txt; set +a
umask 077
cat > /srv/wishd/.env <<EOF
ANTHROPIC_API_KEY=<USER_VALUE>
KH_BASE_URL=http://keeperhub:3000
NEXT_PUBLIC_KH_BASE_URL=https://kh.simula.online
KH_ACCESS_TOKEN=${KEEPERHUB_API_KEY}
WISHD_APP_URL=https://wishd.simula.online
UNISWAP_API_KEY=<USER_VALUE>
RPC_URL_1=<USER_VALUE>
RPC_URL_8453=<USER_VALUE>
RPC_URL_42161=<USER_VALUE>
RPC_URL_10=<USER_VALUE>
RPC_URL_137=<USER_VALUE>
RPC_URL_130=<USER_VALUE>
RPC_URL_11155111=<USER_VALUE>
NODE_ENV=production
EOF
chmod 600 /srv/wishd/.env
```

Note `KH_BASE_URL=http://keeperhub:3000` — the `app` service in keeperhub compose has network alias `keeperhub` (Task 8), so wishd reaches it as `http://keeperhub:3000` over the shared `simula-net`.

- [ ] **Step 2: Replace placeholders with real values**

For each `<USER_VALUE>`, run `sed -i "s|<USER_VALUE>|<actual>|" /srv/wishd/.env` once per key, in order.

- [ ] **Step 3: Verify no placeholders remain**

```bash
grep -c '<USER_VALUE>' /srv/wishd/.env
# Expect: 0
grep -cE '^[A-Z_]+=' /srv/wishd/.env
# Expect: 14
```

---

## Task 13: Write `Caddyfile`

**Files:** Create/replace `/etc/caddy/Caddyfile`

- [ ] **Step 1: Write file**

```bash
cat > /etc/caddy/Caddyfile <<'CADDY'
wishd.simula.online {
    reverse_proxy 127.0.0.1:3001
    encode zstd gzip
}

kh.simula.online {
    reverse_proxy 127.0.0.1:3002
    encode zstd gzip
}
CADDY
```

- [ ] **Step 2: Validate**

```bash
caddy validate --config /etc/caddy/Caddyfile
# Expect: Valid configuration
```

- [ ] **Step 3: Reload caddy**

```bash
systemctl reload caddy
systemctl status caddy --no-pager | head -10
# Expect: active (running)
```

(TLS certs will be issued lazily on first request; no error here even though backends are not up yet.)

---

## Task 14: Run keeperhub migrator

**Files:** none (runs container)

- [ ] **Step 1: Build + run migrator**

```bash
cd /srv/keeperhub
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrator
```

This will:
1. Build the `migrator` stage of the keeperhub Dockerfile (slow first time — minutes).
2. Start postgres if not already up.
3. Run `pnpm db:migrate` against it.

Expected exit: 0. Output ends with the last applied migration name.

- [ ] **Step 2: Verify db is healthy**

```bash
docker ps --filter "name=keeperhub" --format "{{.Names}}\t{{.Status}}"
# Expect db container with "Up X seconds (healthy)"
```

If migrator fails: read full output, check `.env` `DATABASE_URL` matches compose, check db container logs (`docker logs keeperhub-db-1`).

---

## Task 15: Bring up keeperhub stack

**Files:** none

- [ ] **Step 1: Build + start app**

```bash
cd /srv/keeperhub
docker compose -f docker-compose.prod.yml up -d --build app db
```

First build is slow (multi-stage Next.js, ~5–10 min on CX22). Watch for OOM (`Killed` in output) — if so, ensure swap is on and retry.

- [ ] **Step 2: Verify both containers up**

```bash
docker compose -f docker-compose.prod.yml ps
# Expect: db (healthy), app (running)
```

- [ ] **Step 3: Hit local app port**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/
# Expect: 200 or 302/307 (auth redirect). 502/503 = app not ready.
```

If 502, give it 30s more and retry — Next.js prod start takes time on first run.

- [ ] **Step 4: Hit through Caddy**

```bash
curl -sSI https://kh.simula.online/ | head -3
# Expect: HTTP/2 200 or 30x; valid TLS cert (no self-signed warning).
```

If TLS fails (`certificate signed by unknown authority`), check `journalctl -u caddy -n 50` — common cause is DNS not yet pointing at this box.

---

## Task 16: Bring up wishd stack

**Files:** none

- [ ] **Step 1: Build + start**

```bash
cd /srv/wishd
docker compose -f docker-compose.prod.yml up -d --build
```

First build slow. Same OOM caveat — watch for `Killed` and retry if swap not active.

- [ ] **Step 2: Verify**

```bash
docker compose -f docker-compose.prod.yml ps
# Expect: web (running)
```

- [ ] **Step 3: Local port check**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/
# Expect: 200
```

- [ ] **Step 4: Public check**

```bash
curl -sSI https://wishd.simula.online/ | head -3
# Expect: HTTP/2 200; valid TLS cert.
```

- [ ] **Step 5: Verify wishd → keeperhub internal connectivity**

```bash
docker exec $(docker ps -qf name=wishd-web-1) \
  wget -qO- --timeout=5 http://app:3000/ | head -c 200
# Expect: HTML or JSON from keeperhub. Non-empty output = network works.
```

If empty / connection refused: confirm both containers joined `simula-net`:

```bash
docker network inspect simula-net --format '{{range .Containers}}{{.Name}} {{end}}'
# Expect both wishd-web-1 and keeperhub-app-1 listed.
```

---

## Task 17: kh-auth callback registration

**Files:** none in this task — investigation + possible env tweak.

The wishd app OAuths into keeperhub (per spec Q4). The OAuth callback is `https://wishd.simula.online/api/keepers/kh-callback`. Keeperhub must accept that redirect.

- [ ] **Step 1: Locate the allowlist**

```bash
grep -rEn "redirect|callback|allowed.*origin" \
  /srv/keeperhub/lib /srv/keeperhub/app/api 2>/dev/null \
  | grep -iE "auth|oauth|kh" | head -20
```

Look for a config that lists allowed callback URLs or origins (likely in better-auth config, or a custom kh-auth route handler).

- [ ] **Step 2: Decide action based on what you find**

- If the allowlist is in env: add the env var to `/srv/keeperhub/.env` and restart `app` (`docker compose -f docker-compose.prod.yml up -d app`).
- If the allowlist is in code: file an issue or apply the smallest patch to add `https://wishd.simula.online` as an allowed origin. Document the patch path.
- If no allowlist exists (open redirect by API key): do nothing, just confirm the wishd kh-auth flow works end-to-end in Task 18.

- [ ] **Step 3: Smoke the OAuth flow (manual, by user)**

Ask user to: open `https://wishd.simula.online`, trigger the kh-auth start flow (whatever button does that), confirm they're redirected to `kh.simula.online`, log in, and get bounced back to wishd with a successful callback.

If it fails, read browser network tab + `docker logs keeperhub-app-1` and iterate.

---

## Task 18: Backup cron

**Files:** Create `/etc/cron.daily/pg-backup`, `/srv/backups/pg/`

- [ ] **Step 1: Create backup directory**

```bash
mkdir -p /srv/backups/pg
chmod 700 /srv/backups/pg
```

- [ ] **Step 2: Write cron script**

```bash
cat > /etc/cron.daily/pg-backup <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
DB_CID=$(docker ps -qf name=keeperhub-db-1)
if [ -z "$DB_CID" ]; then
  echo "[pg-backup] db container not running, skipping"
  exit 0
fi
docker exec "$DB_CID" \
  pg_dump -U postgres -d keeperhub -F c \
  > "/srv/backups/pg/keeperhub-$TS.dump"
find /srv/backups/pg -name "keeperhub-*.dump" -mtime +7 -delete
BASH
chmod +x /etc/cron.daily/pg-backup
```

- [ ] **Step 3: Test it runs**

```bash
/etc/cron.daily/pg-backup
ls -lh /srv/backups/pg/
# Expect one keeperhub-*.dump file, non-zero size.
```

- [ ] **Step 4: Verify cron service is active**

```bash
systemctl status cron --no-pager | head -3
# Expect: active (running)
```

---

## Task 19: Deploy scripts

**Files:** Create `/srv/deploy-kh.sh`, `/srv/deploy-wishd.sh`

- [ ] **Step 1: Write deploy-kh.sh**

```bash
cat > /srv/deploy-kh.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
cd /srv/keeperhub
git pull --ff-only
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrator
docker compose -f docker-compose.prod.yml up -d --build app db
docker image prune -f
echo "[deploy-kh] done at $(date -u)"
BASH
chmod +x /srv/deploy-kh.sh
```

- [ ] **Step 2: Write deploy-wishd.sh**

```bash
cat > /srv/deploy-wishd.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
cd /srv/wishd
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
echo "[deploy-wishd] done at $(date -u)"
BASH
chmod +x /srv/deploy-wishd.sh
```

- [ ] **Step 3: Verify shellcheck-clean (best-effort)**

```bash
which shellcheck >/dev/null 2>&1 && shellcheck /srv/deploy-*.sh || echo "shellcheck not installed; skip"
```

Optional. Either result is acceptable.

---

## Task 20: Final smoke + handoff

- [ ] **Step 1: Container inventory**

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# Expect 3 running: keeperhub-db-1, keeperhub-app-1, wishd-web-1
```

- [ ] **Step 2: Endpoint check from outside the box**

Ask user to run from their laptop:

```bash
curl -sSI https://wishd.simula.online/ | head -1
curl -sSI https://kh.simula.online/   | head -1
```

Both must return `HTTP/2 200` (or a 30x). TLS must be valid.

- [ ] **Step 3: Browser smoke (manual, by user)**

Ask user to:
1. Open `https://wishd.simula.online` → page renders, no console errors.
2. Open `https://kh.simula.online` → keeperhub login page renders.
3. Run the auto-compounding demo flow end-to-end.

- [ ] **Step 4: Print summary**

Echo the locations of secrets + scripts so the user has a record:

```
Secrets:    /root/.simula-secrets.txt
KH env:     /srv/keeperhub/.env
Wishd env:  /srv/wishd/.env
Caddy:      /etc/caddy/Caddyfile
Backups:    /srv/backups/pg/   (daily, 7-day rotation)
Deploy:     /srv/deploy-kh.sh, /srv/deploy-wishd.sh
```

Done.

---

## Rollback notes (not steps — reference only)

- **Bad deploy:** `cd /srv/<repo> && git reset --hard <prev-sha> && docker compose -f docker-compose.prod.yml up -d --build`.
- **DB corruption:** stop app, restore latest dump:
  `docker exec -i keeperhub-db-1 pg_restore -U postgres -d keeperhub --clean < /srv/backups/pg/<dump>`.
- **TLS broken:** `journalctl -u caddy -n 200 --no-pager`. Common: DNS regression, rate-limit (5 cert/wk per registered domain).
- **OOM during build:** confirm swap (`swapon --show`); if persistent, resize box up to CX32 in Hetzner Console (no rebuild needed, just reboot).
