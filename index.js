const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// 1. Setup PORT for Cloud Hosting
const PORT = process.env.PORT || 3001;

// 2. Middleware
app.use(cors());

// 3. Health Check Routes
app.get("/", (req, res) => {
    res.send("Bondhu 2.0 Server is Running!");
});

app.get("/ping", (req, res) => {
    res.status(200).send("pong");
});

const server = http.createServer(app);

// 4. Socket.io Setup with FIXED CORS
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:5173", 
            "http://localhost:8080", 
            "https://lovely-valkyrie-d8f395.netlify.app" // Clean link here
        ], 
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("join_room", (data) => {
        socket.join(data);
        console.log(`User with ID: ${socket.id} joined room: ${data}`);
    });

    socket.on("send_message", (data) => {
        socket.to(data.room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
    });
});

// 5. Start Server
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});