# Host port registry

One Linux box runs several unrelated stacks. Docker will happily let two of them
ask for the same host port, and the second one to start simply fails to bind —
which is how an edge proxy ends up not listening and a working site starts
answering "You are offline".

The rule that prevents it: **every stack owns a numbered block, and no service
publishes a port outside its own block.** Blocks are 100 wide, which is far more
than any of these stacks will ever need.

## Blocks

| Stack | HTTP block | Postgres | Redis |
| --- | --- | --- | --- |
| **SchoolSphere** | `8100–8199` | `5434` (reserved, not published) | — |
| ClinicOS | `8200–8299` | `5435` | `6381` |
| Lactora | `8300–8399` | `5433` | `6380` |

`80`, `443` and `443/udp` are **not** in any block. They belong to exactly one
container on this host — SchoolSphere's `caddy` — because it is the only thing
terminating TLS. Anything else that wants to be reachable from the internet gets
proxied through it or published on its own block behind a tunnel.

## SchoolSphere assignments

| Service | Host binding | Variable | Default |
| --- | --- | --- | --- |
| `caddy` (http) | `0.0.0.0:80` | `EDGE_HTTP_PORT` | `80` |
| `caddy` (https) | `0.0.0.0:443` + udp | `EDGE_HTTPS_PORT` | `443` |
| `app` | `127.0.0.1:8100` | `APP_HOST_PORT` | `8100` |
| `db` | not published | — | — |
| `db` (local dev only) | `127.0.0.1:5432` | `DEV_DB_PORT` | `5432` |

Everything except the edge proxy binds `127.0.0.1`. A published port on
`0.0.0.0` is on the public internet whether or not you meant it to be — a
`docker publish` rule is written straight into iptables and is **not** filtered
by ufw.

## Moving the other two stacks into their blocks

These live in their own repositories, so the edits happen there. Current
bindings and where they should go:

| Container | Now | Should be |
| --- | --- | --- |
| `clinicos-frontend-1` | `127.0.0.1:8081` | `127.0.0.1:8200` |
| `clinicos-backend-1` | `127.0.0.1:8001` | `127.0.0.1:8201` |
| `lactora-web` | `0.0.0.0:8080` | `127.0.0.1:8300` |
| `lactora-postgres` | `127.0.0.1:5433` | unchanged — already in block |
| `lactora-redis` | `127.0.0.1:6380` | unchanged — already in block |

`lactora-web` on `0.0.0.0:8080` is the one worth doing first: it is reachable
from the internet on `http://169.58.175.152:8080` with no TLS in front of it.

## Checking before you deploy

```bash
./scripts/preflight-ports.sh
```

It reads the same `.env.production` the stack does, so it always checks the
ports you are actually about to bind, and it names the container currently
holding a port instead of just saying "address already in use".
`scripts/deploy.sh` runs it automatically.
