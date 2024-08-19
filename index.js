const express = require('express');
const { createServer } = require('http');
const path = require('path');
const { Server } = require('socket.io');

let io;

const prepare = (app) => {
    const server = createServer(app);
    io = new Server(server, {
        path: '/socket.io',
        addTrailingSlash: false,
        transports: ['websocket'],
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000
    });

    let players = {};

    app.use(express.static(path.join(__dirname, '../public')));

    app.get('/', (_, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        players[socket.id] = {
            id: socket.id,
            x: Math.floor(Math.random() * 700) + 50,
            y: Math.floor(Math.random() * 500) + 50,
            flipX: false
        };

        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        io.emit('updateOnlineCount', Object.keys(players).length);

        socket.on('playerMovement', (movementData) => {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].flipX = movementData.flipX;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        });

        socket.on('playerDashed', (dashData) => {
            players[socket.id].x = dashData.x;
            players[socket.id].y = dashData.y;
            players[socket.id].flipX = dashData.flipX;
            socket.broadcast.emit('playerDashed', players[socket.id]);
        });

        socket.on('chatMessage', (message) => {
            io.emit('chatMessage', { playerId: socket.id, message: message });
        });

        socket.on('getPlayers', () => {
            socket.emit('currentPlayers', players);
            io.emit('updateOnlineCount', Object.keys(players).length);
        });

        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
            io.emit('updateOnlineCount', Object.keys(players).length);
        });
    });

    return server;
};

const app = express();
const server = prepare(app);

if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

module.exports = server;
