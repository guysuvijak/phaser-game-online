const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    path: '/socket.io'
});

const port = process.env.PORT || 3000;

let players = {};

app.get('/favicon.ico', (req, res) => res.status(204));

app.use(express.static('public', {
    setHeaders: (res, path, stat) => {
      if (path.endsWith('.js')) {
        res.set('Content-Type', 'application/javascript');
      }
    }
}));

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

if (process.env.NODE_ENV !== 'production') {
    httpServer.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

module.exports = app;