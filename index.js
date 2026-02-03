import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// 1. Professional CORS: Allows your frontend to connect from ANY platform
app.use(cors({
    origin: true, 
    credentials: true
}));

// 2. Wake-up Route: Essential to stop the "Connecting..." hang
app.get("/ping", (req, res) => res.send("pong"));
app.get("/", (req, res) => res.send("Server is Online"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  // 3. MAILBOX SYSTEM: Solves the "User Finding" issue
  socket.on("join_room", (email) => {
    if(!email) return;
    const cleanEmail = email.toLowerCase().trim();
    socket.join(cleanEmail);
    console.log(`Mailbox active for: ${cleanEmail}`);
  });

  socket.on("message", (msg) => {
    if (msg.target) {
      // Direct delivery to the friend's email room
      io.to(msg.target.toLowerCase().trim()).emit("message", msg);
    } else {
      // Global chat broadcast
      io.emit("message", msg);
    }
  });

  socket.on("disconnect", () => {});
});

// 4. Dynamic Port for Production
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Professional Server running on port ${PORT}`);
});