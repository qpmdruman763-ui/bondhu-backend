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
    origin: true, // Allow all origins (or set specific URL for production)
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. JOIN ROOM (CRITICAL FOR PRIVATE CHAT)
  socket.on("join_room", (email) => {
    if(!email) return;
    const cleanEmail = email.toLowerCase().trim();
    socket.join(cleanEmail);
    console.log(`📬 Mailbox active for: ${cleanEmail}`);
  });

  // 2. GLOBAL MESSAGES (Client emits "message")
  socket.on("message", (msg) => {
    // Broadcast to everyone (including sender, though client handles optimistic UI)
    io.emit("message", msg);
  });

  // 3. PRIVATE MESSAGES (Client emits "private_message")
  // --- THIS WAS MISSING ---
  socket.on("private_message", (data) => {
    // In your client, you send 'targetId', not 'target'
    if (data.targetId) {
      const target = data.targetId.toLowerCase().trim();
      
      console.log(`🔏 Private msg from ${data.senderId} to ${target}`);
      
      // Emit to the specific room (the receiver)
      // Note: We emit the exact same event name "private_message" so the client listener catches it
      io.to(target).emit("private_message", data);
    }
  });

  // 4. REACTIONS
  socket.on("message_reaction", (data) => {
    // Client sends 'target' here based on your previous code
    if(data.target) {
        io.to(data.target.toLowerCase().trim()).emit("message_reaction", data);
    }
  });

  // 5. TYPING INDICATOR
  socket.on("typing", (data) => {
    if (data.target) {
      io.to(data.target.toLowerCase().trim()).emit("typing", data);
    }
  });

  // ==========================================
  // --- RTC SIGNALING (CALLING) ---
  // ==========================================

  socket.on("call_user", (data) => {
    // data.to is usually the email
    if (data.to) {
        const target = data.to.toLowerCase().trim();
        io.to(target).emit("incoming_call", {
          from: data.from,
          offer: data.offer,
          type: data.type
        });
    }
  });

  socket.on("call_accepted", (data) => {
    if (data.to) {
        const target = data.to.toLowerCase().trim();
        io.to(target).emit("call_accepted", data.answer);
    }
  });

  socket.on("call_candidate", (data) => {
    if (data.target) {
        const target = data.target.toLowerCase().trim();
        io.to(target).emit("call_candidate", data.candidate);
    }
  });

  // END CALL SIGNAL
  socket.on("end_call", (data) => {
    if(data && data.to) {
        const target = data.to.toLowerCase().trim();
        io.to(target).emit("end_call");
    }
  });

  // ==========================================
  // --- LIVE SCRIPT RELAY ---
  // ==========================================
  socket.on("live_script_data", (data) => {
    if (data.target) {
      const target = data.target.toLowerCase().trim();
      // FIXED: Client listens for "live_script_data", so we must emit that name
      // (Your previous code emitted "live_script_received", which the client ignores)
      io.to(target).emit("live_script_data", {
        text: data.text,
        from: socket.id
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bondhu Server running on port ${PORT}`);
});