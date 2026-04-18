# ClickHouse Password Rotation Runbook

This runbook documents how to rotate the ClickHouse `default` user password
across the entire fleet **without downtime, dropped queries, or ECS task
restarts**.

## TL;DR

```bash
export AWS_REGION=ap-south-1
export PLANE_URLS="http://ccc-management-alb.internal,\
http://ccc-dp-in-west-1-alb.internal,\
http://ccc-dp-us-east-1-alb.internal,\
http://ccc-dp-ke-east-1-alb.internal,\
http://ccc-dp-sa-central-1-alb.internal,\
http://ccc-dp-bh-east-1-alb.internal"

./deploy/ecs/scripts/rotate-clickhouse-password.sh
```

That single command rotates the password end-to-end. On success, every plane
is using the new credential and the old one is no longer accepted by the
ClickHouse server.

## How it works

The script implements ClickHouse's two-phase rotation pattern so old and new
passwords are valid **simultaneously** during the swap:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ALTER USER default ADD IDENTIFIED WITH sha256_password BY '<new>'│
│    → ClickHouse now accepts BOTH old and new passwords.             │
├─────────────────────────────────────────────────────────────────────┤
│ 2. Write <new> to Secrets Manager (shared + per-region).            │
│    → Future task restarts boot with the new credential.             │
├─────────────────────────────────────────────────────────────────────┤
│ 3. POST /api/admin/clickhouse/rotate-password to every plane.       │
│    → Each plane validates <new> against ClickHouse, then hot-swaps  │
│      the password on its in-process singleton.                      │
│    → In-flight queries finish on the OLD password (still valid).    │
│    → New queries use the NEW password.                              │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Verify <new> works directly against ClickHouse.                  │
├─────────────────────────────────────────────────────────────────────┤
│ 5. ALTER USER default IDENTIFIED WITH sha256_password BY '<new>'    │
│    → Old password is dropped; only <new> works going forward.       │
└─────────────────────────────────────────────────────────────────────┘
```

Because the rotate endpoint **validates against ClickHouse before
swapping**, a bad password cannot break a running plane. And because the
hot-swap mutates a live singleton instead of recreating the client, every
plane stays connected — no `EADDRNOTAVAIL`, no Kafka consumer reset, no
empty health card.

## One-time setup

Before the first rotation, populate the rotation token and ensure every
plane is wired to read it.

1. **Create the rotation token** (any 32+ char random string):

   ```bash
   aws secretsmanager create-secret \
     --region "$AWS_REGION" \
     --name ccc/shared/clickhouse-rotation-token \
     --secret-string "$(openssl rand -base64 48)"
   ```

   `setup-secrets.sh` now prompts for this value automatically when you
   answer "y" to the ClickHouse block, so on a fresh install you can skip
   this step.

2. **Redeploy the management + data planes** so the new
   `CLICKHOUSE_ROTATION_TOKEN` env var is injected into the running tasks:

   ```bash
   ENABLE_CLICKHOUSE=true ./deploy/ecs/scripts/deploy-stacks.sh --stack management
   ENABLE_CLICKHOUSE=true ./deploy/ecs/scripts/deploy-stacks.sh --stack data
   ```

3. **Verify** the planes have the token. Without it the rotate endpoint
   refuses with HTTP 503:

   ```bash
   curl -sf -X POST -H 'X-Rotation-Token: anything' \
     http://ccc-management-alb.internal/api/admin/clickhouse/rotate-password \
     -H 'Content-Type: application/json' -d '{}'
   # Expect: HTTP 401 ("Invalid rotation token") — meaning the env var IS set.
   # If you see HTTP 503 ("Rotation disabled"), the env var is missing.
   ```

## Operating procedure

From a bastion that can reach the ClickHouse NLB **and** every plane's
internal ALB:

```bash
export AWS_REGION=ap-south-1
export PLANE_URLS="http://mgmt.internal,http://dp-region-1.internal,…"

# Optional: dry-run first to see exactly what will happen
./deploy/ecs/scripts/rotate-clickhouse-password.sh --dry-run

# Real rotation (auto-generates a 43-char base64url password)
./deploy/ecs/scripts/rotate-clickhouse-password.sh

# Or supply your own password (must be ≥ 8 chars and differ from current)
./deploy/ecs/scripts/rotate-clickhouse-password.sh --password 'my-strong-password'
```

The script is **idempotent**: re-running after a partial failure picks up
the in-progress state safely. If any plane fails to hot-swap, the script
aborts **before** dropping the old password — the cluster keeps working on
the existing credentials and you can investigate the failed plane without
panic.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Rotation disabled: CLICKHOUSE_ROTATION_TOKEN is not set` | Plane env var missing | Redeploy plane with `ENABLE_CLICKHOUSE=true` after the token secret is created |
| `Invalid rotation token` | Token in SM differs from token loaded by the plane | The plane was deployed before the token existed. Force a new task revision (`aws ecs update-service --force-new-deployment …`) so it reloads SM |
| `Validation against ClickHouse failed` | New password rejected by CH (e.g. step 2 didn't fire) | Check `/var/log/clickhouse-server.log` on the EC2 instance; re-run the `ALTER USER default ADD IDENTIFIED …` statement manually |
| Some planes fail step 4 | Plane unreachable from the bastion | Verify SG/NACL ingress; re-run the script (skips already-rotated planes implicitly because validation will re-pass) |
| Need to abort mid-rotation | Old password still works between steps 1–5 | Just stop. Both passwords remain valid until step 6 completes. To roll back, run `ALTER USER default IDENTIFIED WITH sha256_password BY '<original>'` against ClickHouse and undo the SM updates |

## Related files

- `deploy/ecs/scripts/rotate-clickhouse-password.sh` — the rotation orchestrator
- `deploy/ecs/scripts/setup-secrets.sh` — seeds the rotation token at first install
- `deploy/ecs/scripts/validate-secrets.sh` — checks the token exists when `ENABLE_CLICKHOUSE=true`
- `deploy/ecs/cloudformation/management-plane.yml` — wires `CLICKHOUSE_ROTATION_TOKEN` into the management task
- `deploy/ecs/cloudformation/data-plane.yml` — wires `CLICKHOUSE_ROTATION_TOKEN` into each data-plane task
- `server/clickhouse-client.ts` — `rotateClickHousePassword()` and the live-mutable singleton
- `server/routes.ts` — `POST /api/admin/clickhouse/rotate-password` handler
