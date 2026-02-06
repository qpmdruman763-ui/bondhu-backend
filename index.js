import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import admin from "firebase-admin"; 
import { createRequire } from "module"; 

const require = createRequire(import.meta.url);

// ==========================================
// --- SECURE FIREBASE INITIALIZATION ---
// ==========================================
let serviceAccount = null;

if (process.env.FIREBASE_CONFIG) {
  // 1. This runs on RENDER (Uses your Environment Variable)
  serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
} else {
  // 2. This runs on your MacBook
  try {
    serviceAccount = require("./serviceAccount.json");
  } catch (e) {
    console.log("Local serviceAccount.json not found. If this is Render, ignore this.");
  }
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin Initialized Successfully");
  } catch (error) {
    console.error("Firebase Init Error:", error.message);
  }
}
// ==========================================

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
  
  socket.on("join_room", (email) => {
    if(!email) return;
    const cleanEmail = email.toLowerCase().trim();
    socket.join(cleanEmail);
    console.log(`Mailbox active for: ${cleanEmail}`);
  });

  socket.on("message", (msg) => {
    if (msg.target) {
      const target = msg.target.toLowerCase().trim();
      io.to(target).emit("message", msg);

      // --- SEND PUSH NOTIFICATION ---
      if (msg.receiverToken && msg.type === 'text' && serviceAccount) {
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
              .catch((error) => console.error("Push Error:", error.message));
      }

    } else {
      io.emit("message", msg);
    }
  });

  socket.on("message_reaction", (data) => {
    if(data.target) {
        io.to(data.target.toLowerCase().trim()).emit("message_reaction", data);
    }
  });

  socket.on("typing", (data) => {
    if (data.target) {
      io.to(data.target.toLowerCase().trim()).emit("typing", data);
    }
  });

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

  socket.on("end_call", (data) => {
    if(data.to) {
        const target = data.to.toLowerCase().trim();
        io.to(target).emit("end_call");
    }
  });

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