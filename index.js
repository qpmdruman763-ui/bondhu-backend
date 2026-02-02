import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" } // Allows connection from Netlify/Vercel/Everywhere
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // --- THE ONLY ADDITION NEEDED ---
  // When a user logs in, they join a "Room" named after their email.
  socket.on("join_room", (email) => {
    socket.join(email); 
  });

  socket.on("message", (msg) => {
    if (msg.target) {
      // PROFESSIONAL: Send only to the person with that email
      io.to(msg.target).emit("message", msg);
    } else {
      // PROTOTYPE STYLE: Global chat
      io.emit("message", msg);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.get("/", (req, res) => { res.send("Backend is running"); });

// RENDER/PRODUCTION PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});