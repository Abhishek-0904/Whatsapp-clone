const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require("socket.io");

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev simplicity
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("send_message", (data) => {
        // Broadcast to everyone else
        socket.broadcast.emit("receive_message", data);
    });

    socket.on("typing", (data) => {
        socket.broadcast.emit("user_typing", data);
    });

    socket.on("stop_typing", (data) => {
        socket.broadcast.emit("user_stop_typing", data);
    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
    });
});

server.listen(5000, () => {
    console.log("SERVER RUNNING ON PORT 5000");
});
