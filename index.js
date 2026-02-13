import express from "express";
import http from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import cors from "cors";
import Redis from "ioredis";
import { isAllowed, cleanup as rateLimitCleanup } from "./rateLimiter.js";

const isProd = process.env.NODE_ENV === "production";
const log = (...args) => {
  if (!isProd) console.log("[Bondhu]", ...args);
};
const logConnect = () => {
  if (!isProd) return;
  const n = io.engine?.clientsCount ?? 0;
  if (n < 100 || n % 500 === 0) console.log("[Bondhu] Connections:", n);
};

// CORS: set CORS_ORIGIN to comma-separated origins in production (e.g. https://bondhu.site,https://www.bondhu.site)
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : true;

const app = express();

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.get("/ping", (req, res) => res.send("pong"));
app.get("/", (req, res) => res.send("Server is Online"));
app.get("/health", (req, res) => {
  const count = io.engine?.clientsCount ?? 0;
  res.json({ ok: true, connections: count, env: isProd ? "production" : "development" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e6,
});

// Optional Redis adapter for horizontal scaling (multiple server instances)
const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  try {
    const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    io.adapter(createAdapter(pub, sub));
    log("Redis adapter attached; multi-instance scaling enabled");
  } catch (err) {
    console.error("[Bondhu] Redis adapter failed:", err.message);
  }
}

// Normalize room key (email or group name)
const toRoom = (v) => (v && typeof v === "string" ? v.toLowerCase().trim() : "");

// Server-side dedupe: forward each private message only once per target (stops duplicate delivery)
const recentPrivateForwards = new Map();
const DEDUPE_WINDOW_MS = 120 * 1000;
const MAX_DEDUPE_KEYS = 20000;
const prunePrivateDedupe = () => {
  if (recentPrivateForwards.size <= MAX_DEDUPE_KEYS) return;
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [k, t] of recentPrivateForwards.entries()) {
    if (t < cutoff) recentPrivateForwards.delete(k);
  }
};

io.on("connection", (socket) => {
  log("User connected:", socket.id);
  logConnect();

  socket.on("join_room", (roomId) => {
    const room = toRoom(roomId);
    if (!room) return;
    socket.join(room);
    log("Mailbox active for:", room);
  });

  // Global messages: only to clients in group_global (same design & behavior)
  socket.on("message", (msg) => {
    if (!isAllowed(socket.id, "message")) {
      socket.emit("error_message", "Rate limit: too many messages");
      return;
    }
    io.to("group_global").emit("message", msg);
  });

  socket.on("private_message", (data) => {
    if (!isAllowed(socket.id, "private_message")) {
      socket.emit("error_message", "Rate limit: too many private messages");
      return;
    }
    const target = toRoom(data?.targetId);
    if (!target) return;
    const msgId = data?.id != null ? String(data.id) : `${data?.timestamp || ""}-${data?.senderId || ""}`;
    const dedupeKey = `${msgId}:${target}`;
    const now = Date.now();
    const last = recentPrivateForwards.get(dedupeKey);
    if (last != null && now - last < DEDUPE_WINDOW_MS) return;
    recentPrivateForwards.set(dedupeKey, now);
    prunePrivateDedupe();
    io.to(target).emit("private_message", data);
  });

  socket.on("message_reaction", (data) => {
    if (!isAllowed(socket.id, "message_reaction")) return;
    const target = toRoom(data?.target);
    if (target) io.to(target).emit("message_reaction", data);
  });

  socket.on("typing", (data) => {
    if (!isAllowed(socket.id, "typing")) return;
    const target = toRoom(data?.target);
    if (target) io.to(target).emit("typing", data);
  });

  // RTC signaling
  socket.on("call_user", (data) => {
    if (!isAllowed(socket.id, "call_user")) {
      socket.emit("error_message", "Rate limit: too many call attempts");
      return;
    }
    const target = toRoom(data?.to);
    if (!target) return;
    io.to(target).emit("incoming_call", {
      from: data.from,
      offer: data.offer,
      encryptedOffer: data.encryptedOffer,
      type: data.type,
    });
  });

  socket.on("call_accepted", (data) => {
    const target = toRoom(data?.to);
    if (target) io.to(target).emit("call_accepted", data);
  });

  socket.on("call_candidate", (data) => {
    const target = toRoom(data?.target);
    if (target) io.to(target).emit("call_candidate", data);
  });

  socket.on("end_call", (data) => {
    const target = data?.to ? toRoom(data.to) : "";
    if (target) io.to(target).emit("end_call");
  });

  socket.on("call_declined", (data) => {
    const target = data?.to ? toRoom(data.to) : "";
    if (target) io.to(target).emit("call_declined");
  });

  socket.on("live_script_data", (data) => {
    if (!isAllowed(socket.id, "live_script_data")) return;
    const target = toRoom(data?.target);
    if (target) io.to(target).emit("live_script_data", { text: data.text, from: socket.id });
  });

  socket.on("disconnect", () => {
    rateLimitCleanup(socket.id);
    log("User disconnected:", socket.id);
    logConnect();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bondhu Server running on port ${PORT} (${isProd ? "production" : "development"})`);
  if (REDIS_URL) console.log("Redis adapter: enabled");
});
