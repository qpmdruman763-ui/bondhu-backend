import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import admin from "firebase-admin"; // 1. Added Firebase Admin
import { createRequire } from "module"; // 2. Added to handle JSON import safely

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccount.json");

// 3. Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
  
  // 1. JOIN ROOM
  socket.on("join_room", (email) => {
    if(!email) return;
    const cleanEmail = email.toLowerCase().trim();
    socket.join(cleanEmail);
    console.log(`Mailbox active for: ${cleanEmail}`);
  });

  // 2. TEXT MESSAGES (Updated with Push Logic)
  socket.on("message", (msg) => {
    if (msg.target) {
      const target = msg.target.toLowerCase().trim();
      io.to(target).emit("message", msg);

      // --- NEW: SEND PUSH NOTIFICATION IF TOKEN IS PROVIDED ---
      // If the client sends 'receiverToken', the server will trigger Firebase
      if (msg.receiverToken && msg.type === 'text') {
          const pushPayload = {
              notification: {
                  title: `Message from ${msg.user || 'Bondhu'}`,
                  body: msg.text.length > 100 ? msg.text.substring(0, 97) + "..." : msg.text
              },
              token: msg.receiverToken,
              android: { priority: "high" },
              apns: { payload: { aps: { sound: "default" } } }
          };

          admin.messaging().send(pushPayload)
              .then(() => console.log(`Push sent to: ${target}`))
              .catch((error) => console.error("Error sending push:", error));
      }

    } else {
      io.emit("message", msg);
    }
  });

  // 3. REACTIONS
  socket.on("message_reaction", (data) => {
    if(data.target) {
        io.to(data.target.toLowerCase().trim()).emit("message_reaction", data);
    }
  });

  // 4. TYPING INDICATOR
  socket.on("typing", (data) => {
    if (data.target) {
      io.to(data.target.toLowerCase().trim()).emit("typing", data);
    }
  });

  // ==========================================
  // --- RTC SIGNALING (CALLING) ---
  // ==========================================

  socket.on("call_user", (data) => {
    const target = data.to.toLowerCase().trim();
    io.to(target).emit("incoming_call", {
      from: data.from,
      offer: data.offer,
      type: data.type
    });
  });

  socket.on("call_answer", (data) => {
    const target = data.to.toLowerCase().trim();
    io.to(target).emit("call_accepted", data.answer);
  });

  socket.on("call_candidate", (data) => {
    const target = data.target.toLowerCase().trim();
    io.to(target).emit("call_candidate", data.candidate);
  });

  // --- END CALL SIGNAL ---
  socket.on("end_call", (data) => {
    if(data.to) {
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
      io.to(target).emit("live_script_received", {
        text: data.text,
        from: socket.id
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