import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

app.use(cors({
    origin: true, 
    credentials: true
}));

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
  
  // 1. JOIN ROOM (Mailbox System)
  socket.on("join_room", (email) => {
    if(!email) return;
    const cleanEmail = email.toLowerCase().trim();
    socket.join(cleanEmail);
    console.log(`Mailbox active for: ${cleanEmail}`);
  });

  // 2. TEXT & MEDIA MESSAGES
  socket.on("message", (msg) => {
    if (msg.target) {
      const target = msg.target.toLowerCase().trim();
      // Relay to friend's room
      io.to(target).emit("message", msg);
    } else {
      io.emit("message", msg);
    }
  });

  // 3. TYPING INDICATOR RELAY
  socket.on("typing", (data) => {
    if (data.target) {
      io.to(data.target.toLowerCase().trim()).emit("typing", data);
    }
  });

  // ==========================================
  // --- RTC SIGNALING (FOR CALLING) ---
  // ==========================================

  // Relay the Call Offer to the target friend
  socket.on("call_user", (data) => {
    const target = data.to.toLowerCase().trim();
    io.to(target).emit("incoming_call", {
      from: data.from,
      offer: data.offer,
      type: data.type // 'video' or 'audio'
    });
  });

  // Relay the Answer back to the caller
  socket.on("call_answer", (data) => {
    const target = data.to.toLowerCase().trim();
    io.to(target).emit("call_accepted", data.answer);
  });

  // Relay ICE Candidates (Networking info)
  socket.on("call_candidate", (data) => {
    const target = data.target.toLowerCase().trim();
    io.to(target).emit("call_candidate", data.candidate);
  });

  // ==========================================
  // --- LIVE SCRIPT RELAY ---
  // ==========================================
  socket.on("live_script_data", (data) => {
    if (data.target) {
      const target = data.target.toLowerCase().trim();
      // Send the transcript to the friend
      io.to(target).emit("live_script_received", {
        text: data.text,
        from: socket.id // or email
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bondhu Server running on port ${PORT}`);
});