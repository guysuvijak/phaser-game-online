const socket = io(window.location.origin);

class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.players = {};
        this.dashCooldown = 0;
        this.leaderboard = null;;
        this.logMessages = [];
        this.chatMessages = [];
    }

    preload() {
        this.load.image('player', 'images/player.png');
        this.load.image('otherPlayer', 'images/otherPlayer.png');
        this.load.image('dust', 'images/dust.png');
        this.load.image('background', 'images/background.png');
    }

    create() {
        this.add.image(400, 300, 'background').setOrigin(0.5);

        socket.on('currentPlayers', (players) => {
            Object.keys(players).forEach((id) => {
                if (id === socket.id) {
                    this.addPlayer(this, players[id]);
                } else {
                    this.addOtherPlayers(this, players[id]);
                }
            });
            this.updateLeaderboard();
        });

        socket.on('newPlayer', (playerInfo) => {
            this.addOtherPlayers(this, playerInfo);
            this.addLogMessage(`${playerInfo.id} join.`);
            this.updateLeaderboard();
        });

        this.createChatSystem();

        socket.on('chatMessage', (data) => {
            this.showChatMessage(data.playerId, data.message);
        });

        socket.on('playerDisconnected', (playerId) => {
            if (this.players[playerId]) {
                this.players[playerId].sprite.destroy();
                if (this.players[playerId].progressBar) {
                    this.players[playerId].progressBar.destroy();
                }
                if (this.players[playerId].nameText) {
                    this.players[playerId].nameText.destroy();
                }
                delete this.players[playerId];
                this.addLogMessage(`${playerId} leave.`);
                this.updateLeaderboard();
            }
        });
        socket.on('playerMoved', (playerInfo) => {
            if (this.players[playerInfo.id]) {
                this.players[playerInfo.id].sprite.setPosition(playerInfo.x, playerInfo.y);
                this.players[playerInfo.id].sprite.setFlipX(playerInfo.flipX);
                if (this.players[playerInfo.id].nameText) {
                    this.players[playerInfo.id].nameText.setPosition(playerInfo.x, playerInfo.y - 40);
                }
            }
        });

        socket.on('playerDashed', (playerInfo) => {
            if (this.players[playerInfo.id]) {
                this.players[playerInfo.id].sprite.setPosition(playerInfo.x, playerInfo.y);
                this.createDustEffect(playerInfo.x, playerInfo.y, playerInfo.flipX);
                if (this.players[playerInfo.id].nameText) {
                    this.players[playerInfo.id].nameText.setPosition(playerInfo.x, playerInfo.y - 40);
                }
            }
        });

        this.cursors = this.input.keyboard.createCursorKeys();

        this.onlineText = this.add.text(400, 20, 'Online: 0', { font: '20px Arial', fill: '#FFF' }).setOrigin(0.5, 0);

        socket.on('updateOnlineCount', (count) => {
            this.onlineText.setText(`Online: ${count}`);
        });

        this.createLeaderboard();
        this.createLogArea();

        // Request current players when the scene is created
        socket.emit('getPlayers');
    }

    update(time, delta) {
        if (this.players[socket.id]) {
            let moved = false;
            const speed = 5;
            let flipX = this.players[socket.id].sprite.flipX;

            if (this.cursors.left.isDown) {
                this.players[socket.id].sprite.x -= speed;
                moved = true;
                flipX = true;
            } else if (this.cursors.right.isDown) {
                this.players[socket.id].sprite.x += speed;
                moved = true;
                flipX = false;
            }

            if (this.cursors.up.isDown) {
                this.players[socket.id].sprite.y -= speed;
                moved = true;
            } else if (this.cursors.down.isDown) {
                this.players[socket.id].sprite.y += speed;
                moved = true;
            }

            if (moved) {
                this.players[socket.id].sprite.setFlipX(flipX);
                this.players[socket.id].arrow.setPosition(this.players[socket.id].sprite.x, this.players[socket.id].sprite.y - 40);
                socket.emit('playerMovement', { 
                    x: this.players[socket.id].sprite.x, 
                    y: this.players[socket.id].sprite.y,
                    flipX: flipX
                });
            }

            // Dash logic
            if (this.dashCooldown > 0) {
                this.dashCooldown -= delta;
                this.updateProgressBar();
            }

            if (Phaser.Input.Keyboard.JustDown(this.cursors.space) && this.dashCooldown <= 0) {
                this.dash();
            }
        }
    }

    addPlayer(self, playerInfo) {
        const sprite = self.add.sprite(playerInfo.x, playerInfo.y, 'player')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(30, 30);
        
        const progressBar = this.add.rectangle(playerInfo.x, playerInfo.y + 20, 30, 5, 0x00ff00);
        progressBar.visible = false;

        const arrow = this.add.triangle(playerInfo.x, playerInfo.y - 40, 0, 0, 10, 10, 5, 5, 0xFFFF00);
        arrow.setOrigin(0.5, 1);

        self.players[socket.id] = { sprite, progressBar, arrow };
    }

    addOtherPlayers(self, playerInfo) {
        const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'otherPlayer')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(30, 30);
        otherPlayer.playerId = playerInfo.id;

        const nameText = this.add.text(playerInfo.x, playerInfo.y - 40, playerInfo.id.substring(0, 5), { font: '14px Arial', fill: '#FFF' })
            .setOrigin(0.5, 0.5);

        self.players[playerInfo.id] = { sprite: otherPlayer, nameText: nameText };
    }

    dash() {
        const dashDistance = 150;
        const player = this.players[socket.id].sprite;
        const angle = player.flipX ? Math.PI : 0;  // Left or Right
        
        const newX = player.x + Math.cos(angle) * dashDistance;
        const newY = player.y + Math.sin(angle) * dashDistance;

        player.setPosition(newX, newY);
        this.players[socket.id].arrow.setPosition(newX, newY - 40);
        this.createDustEffect(player.x, player.y, player.flipX);

        socket.emit('playerDashed', { x: newX, y: newY, flipX: player.flipX });

        this.dashCooldown = 3000;  // 3 seconds cooldown
        this.updateProgressBar();
    }

    updateProgressBar() {
        const player = this.players[socket.id];
        if (player && player.progressBar) {
            player.progressBar.setPosition(player.sprite.x, player.sprite.y + 20);
            player.progressBar.displayWidth = (this.dashCooldown / 3000) * 30;  // 30 is the full width
            player.progressBar.visible = this.dashCooldown > 0;
        }
    }

    createDustEffect(x, y, flipX) {
        const particlesConfig = {
            x: x,
            y: y,
            speed: { min: 50, max: 100 },
            angle: { min: flipX ? 0 : 180, max: flipX ? 180 : 360 },
            scale: { start: 0.1, end: 0 },
            blendMode: 'ADD',
            lifespan: 1000,
            gravityY: 0
        };

        const particles = this.add.particles('dust');
        const emitter = particles.createEmitter(particlesConfig);
        emitter.explode(20);  // Emit 20 particles

        this.time.delayedCall(2000, () => {
            particles.destroy();
        });
    }

    createLeaderboard() {
        this.add.rectangle(800, 0, 200, 600, 0x000000, 0.4)
            .setOrigin(1, 0);
        this.leaderboard = this.add.text(750, 20, 'Leaderboard', { font: '16px Arial', fill: '#FFF' })
            .setOrigin(1, 0);
    }

    updateLeaderboard() {
        let leaderboardText = 'Leaderboard\n';
        Object.keys(this.players).forEach((playerId, index) => {
            leaderboardText += `${index + 1}. ${playerId.substring(0, 5)}\n`;
        });
        this.leaderboard.setText(leaderboardText);
    }

    createLogArea() {
        this.logArea = this.add.text(20, 580, '', { font: '14px Arial', fill: '#FFF' })
            .setOrigin(0, 1);
    }

    addLogMessage(message) {
        const color = message.includes('join') ? '#00FF00' : '#FF0000';
        const logMessage = this.add.text(20, 580 - this.logMessages.length * 20, message, { font: '14px Arial', fill: color })
            .setOrigin(0, 1);
        
        this.logMessages.push(logMessage);
        if (this.logMessages.length > 5) {
            const oldestMessage = this.logMessages.shift();
            oldestMessage.destroy();
        }

        // Fade out and destroy after 3 seconds
        this.tweens.add({
            targets: logMessage,
            alpha: { from: 1, to: 0 },
            duration: 1000,
            delay: 3000,
            onComplete: () => {
                const index = this.logMessages.indexOf(logMessage);
                if (index > -1) {
                    this.logMessages.splice(index, 1);
                }
                logMessage.destroy();
                this.repositionLogMessages();
            }
        });
    }

    repositionLogMessages() {
        this.logMessages.forEach((msg, index) => {
            msg.setY(580 - index * 20);
        });
    }

    updateLogArea() {
        const logText = this.logMessages.map(msg => `[color=${msg.color}]${msg.text}[/color]`).join('\n');
        this.logArea.setText(logText);
    }

    createChatSystem() {
        // Create chat container
        const chatContainer = document.createElement('div');
        chatContainer.style.position = 'absolute';
        chatContainer.style.bottom = '10px';
        chatContainer.style.left = '10px';
        chatContainer.style.display = 'flex';
        chatContainer.style.alignItems = 'center';
        chatContainer.style.zIndex = '1000';
    
        // Create chat input
        this.chatInput = document.createElement('input');
        this.chatInput.type = 'text';
        this.chatInput.placeholder = 'Type your message...';
        this.chatInput.style.width = '200px';
        this.chatInput.style.padding = '5px';
        this.chatInput.style.marginRight = '5px';
    
        // Create send button
        const sendButton = document.createElement('button');
        sendButton.textContent = 'Send';
        sendButton.style.padding = '5px 10px';
        sendButton.style.backgroundColor = '#4CAF50';
        sendButton.style.color = 'white';
        sendButton.style.border = 'none';
        sendButton.style.cursor = 'pointer';
    
        // Add elements to container
        chatContainer.appendChild(this.chatInput);
        chatContainer.appendChild(sendButton);
    
        // Add container to the game canvas
        const gameCanvas = this.sys.game.canvas;
        gameCanvas.parentNode.appendChild(chatContainer);
    
        // Position the chat container relative to the game canvas
        const updatePosition = () => {
            const rect = gameCanvas.getBoundingClientRect();
            chatContainer.style.left = `${rect.left + 10}px`;
            chatContainer.style.bottom = `${window.innerHeight - rect.bottom + 10}px`;
        };
    
        // Update position initially and on window resize
        updatePosition();
        window.addEventListener('resize', updatePosition);
    
        // Add event listeners
        sendButton.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }
    

    sendChatMessage() {
        const message = this.chatInput.value.trim();
        if (message) {
            socket.emit('chatMessage', message);
            this.chatInput.value = '';
        }
    }
    
    showChatMessage(playerId, message) {
        const player = this.players[playerId];
        if (player && player.sprite) {
            const chatBubble = this.add.text(player.sprite.x, player.sprite.y - 50, message, {
                font: '14px Arial',
                fill: '#FFFFFF',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: { x: 5, y: 5 }
            });
            chatBubble.setOrigin(0.5);

            // Fade out and destroy after 3 seconds
            this.tweens.add({
                targets: chatBubble,
                alpha: { from: 1, to: 0 },
                y: chatBubble.y - 20,  // Move up slightly as it fades
                duration: 3000,
                onComplete: () => chatBubble.destroy()
            });
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    scene: [MainScene],
    parent: 'game-container',
    backgroundColor: '#3498db'
};

const game = new Phaser.Game(config);