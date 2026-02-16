# Bondhu Server – Production Deployment (5,000+ users)

## Environment variables

| Variable       | Required | Description |
|----------------|----------|-------------|
| `PORT`         | No       | Server port (default: 3000). Set on Render/Railway/etc. |
| `NODE_ENV`     | No       | Set to `production` in production. Reduces log noise. |
| `CORS_ORIGIN`  | No       | Comma-separated allowed origins (e.g. `https://bondhu.site,https://www.bondhu.site`). If unset, allows all origins. |
| `REDIS_URL`    | No       | Redis connection URL. When set, enables multi-instance scaling. |

## Single instance (no Redis)

- Handles thousands of connections on one Node process.
- Set `NODE_ENV=production` and `PORT` as provided by your host.
- Use a process manager (e.g. PM2) and enough memory (e.g. 1–2 GB for 5k users).

## Multi-instance (5k+ users, high availability)

1. Create a Redis instance (e.g. Redis Cloud, Upstash, ElastiCache).
2. Set `REDIS_URL` to that Redis URL on every server instance.
3. Run multiple instances of this server behind a load balancer.
4. Enable sticky sessions if your platform supports it (Socket.io works without, but sticky can reduce reconnects).

All instances will share the same Socket.io rooms and events via Redis.

## Endpoints

- `GET /` – Simple “Server is Online” response.
- `GET /ping` – Returns `pong` (for health checks).
- `GET /health` – Returns `{ ok, connections, env }` for monitoring.

## Rate limits (per socket, per minute)

- Global messages: 60
- Private messages: 120
- Typing: 30
- Call attempts: 10
- Reactions: 60
- Live script: 120

Clients that exceed limits receive an `error_message` event. Design and behaviour of the app are unchanged.
