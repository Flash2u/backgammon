import { state } from './game.js?t=1782015853000';

let peer = null;
let p2pConn = null;
let p2pMyColor = null; // 1: 黑, 2: 白
let oppId = null; // 對手 Peer ID
let pingInterval = null;
let lastHeartbeatReceived = 0;
let reconnectInterval = null;
let reconnectCountdownTimer = null;
let spectatorConns = [];

let lobbySocket = null;
let lobbyRoomsMap = new Map();
let lobbyCallback = null;
let lobbyConnectFailCount = 0;


let callbacks = {
    onStatusChange: (status, color) => {},
    onToast: (msg, isAlert) => {},
    onConnected: (id) => {},
    onPeerConnected: (oppId, myColor) => {},
    onData: (data) => {},
    onClose: () => {},
    onVoiceCall: (call) => {}
};


export const p2p = {
    init(cbs) {
        callbacks = { ...callbacks, ...cbs };

        if (typeof Peer === 'undefined') {
            callbacks.onStatusChange('❌ 無法載入 P2P 模組', '#ef4444');
            callbacks.onToast('⚠️ P2P 庫載入失敗，無法使用連線對戰', true);
            return;
        }

        if (peer && !peer.destroyed) {
            if (p2pConn && p2pConn.open) {
                callbacks.onStatusChange(`已連線 (對手: ${p2pConn.peer})`, 'var(--accent-secondary)');
            } else {
                callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
            }
            return;
        }

        callbacks.onStatusChange('連線信令伺服器中...');
        peer = new Peer(null, {
            debug: 1,
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            path: '/',
            key: 'peerjs',
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            callbacks.onConnected(id);
            if (!p2pConn && p2pMyColor !== 2) {
                callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
            }
        });

        peer.on('disconnected', () => {
            console.log('PeerJS disconnected from signaling server, attempting to reconnect...');
            callbacks.onStatusChange('🔌 信令伺服器中斷，重連中...', '#f59e0b');
            peer.reconnect();
        });

        // 接收連接
        peer.on('connection', (conn) => {
            if (conn.metadata && conn.metadata.isSpectator) {
                // 旁觀者連線
                spectatorConns.push(conn);
                this.setupSpectatorConnection(conn);
                return;
            }

            if (p2pConn && p2pConn.open) {
                conn.close();
                return;
            }

            p2pConn = conn;
            p2pMyColor = 1; // 房主先手黑棋
            this.setupConnection(conn);
        });

        // 接收語音連接
        peer.on('call', (call) => {
            if (callbacks.onVoiceCall) {
                callbacks.onVoiceCall(call);
            }
        });

        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                callbacks.onStatusChange('❌ 找不到該連線 ID', '#ef4444');
                callbacks.onToast('⚠️ 找不到該連線 ID，請確認是否輸入正確', true);
            } else {
                callbacks.onStatusChange(`❌ 連線出錯: ${err.type}`, '#ef4444');
            }
        });
    },

    connect(targetId) {
        if (!peer || peer.destroyed) {
            callbacks.onToast('⚠️ P2P 尚未初始化完成，請稍後...', true);
            return;
        }
        
        callbacks.onStatusChange('連線對手中...', 'var(--text-secondary)');
        p2pMyColor = 2; // 客方白棋後手
        
        const conn = peer.connect(targetId);
        p2pConn = conn;
        this.setupConnection(conn);
    },

    connectSpectator(targetId) {
        if (!peer || peer.destroyed) return;
        p2pMyColor = 0; // 旁觀者無棋色
        
        const conn = peer.connect(targetId, { metadata: { isSpectator: true } });
        this.setupSpectatorConnection(conn);
    },

    setupConnection(conn) {
        oppId = conn.peer;

        const onConnOpen = () => {
            // 清除重新連線定時器
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
            if (reconnectCountdownTimer) {
                clearInterval(reconnectCountdownTimer);
                reconnectCountdownTimer = null;
            }

            const wasReconnecting = state.p2pReconnecting;
            state.p2pReconnecting = false;

            callbacks.onStatusChange(`已連線 (對手: ${conn.peer})`, 'var(--accent-secondary)');
            
            // 判斷是否為斷線重連恢復
            const saved = localStorage.getItem('gomoku_p2p_autosave');
            let isRestoring = false;
            if (saved) {
                const savedState = JSON.parse(saved);
                if (savedState.oppId === conn.peer && Date.now() - savedState.timestamp < 35000) {
                    isRestoring = true;
                }
            }

            if (isRestoring || wasReconnecting) {
                callbacks.onToast('⚡ 連線已恢復！對局無縫繼續...');
                if (p2pMyColor === 2) {
                    this.sendMessage({ type: 'reconnect-request' });
                }
            } else {
                callbacks.onToast(p2pMyColor === 1 ? '連線成功！由您 (黑棋) 先手落子' : '連線成功！等待房主 (黑棋) 開始並落子');
            }
            
            if (callbacks.onPeerConnected) {
                callbacks.onPeerConnected(conn.peer, p2pMyColor);
            }

            // 連線建立成功後，房主主動在大廳註銷房間，避免其他人繼續看到此房間
            if (p2pMyColor === 1) {
                this.unregisterRoom();
            }

            // 啟動心跳包 Ping/Pong
            lastHeartbeatReceived = Date.now();
            if (pingInterval) clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                if (this.isConnected()) {
                    if (Date.now() - lastHeartbeatReceived > 35000) {
                        console.warn('P2P Heartbeat timeout. Closing for reconnect...');
                        this.handleClose();
                        return;
                    }
                    this.sendMessage({ type: 'ping' });
                }
            }, 15000);
        };

        if (conn.open) {
            onConnOpen();
        } else {
            conn.on('open', onConnOpen);
        }

        conn.on('data', (data) => {
            // 心跳包處理
            if (data.type === 'ping') {
                this.sendMessage({ type: 'pong' });
                lastHeartbeatReceived = Date.now();
                return;
            }
            if (data.type === 'pong') {
                lastHeartbeatReceived = Date.now();
                return;
            }

            // 更新最後收到資料時間
            lastHeartbeatReceived = Date.now();
            callbacks.onData(data);
        });

        conn.on('close', () => {
            this.handleClose();
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.handleClose();
        });
    },

    sendMessage(msg) {
        if (p2pConn && p2pConn.open) {
            p2pConn.send(msg);
        }
    },

    handleClose() {
        // 清除心跳包
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        const wasConnected = (p2pConn !== null);
        p2pConn = null;

        // 如果遊戲還在進行且屬於線上對戰，開啟 30 秒自動重連
        if (wasConnected && state.gameMode === 'p2p' && !state.isGameOver && !state.p2pReconnecting) {
            state.p2pReconnecting = true;

            // 儲存目前狀態至 LocalStorage
            const autosaveData = {
                oppId: oppId,
                myPeerId: peer ? peer.id : null,
                board: state.board.map(row => [...row]),
                currentTurn: state.currentTurn,
                history: JSON.parse(JSON.stringify(state.history)),
                lastMove: state.lastMove ? { ...state.lastMove } : null,
                playerColor: p2pMyColor,
                rulesMode: state.rulesMode,
                timestamp: Date.now()
            };
            localStorage.setItem('gomoku_p2p_autosave', JSON.stringify(autosaveData));

            let timeLeft = 30;
            callbacks.onStatusChange(`斷線重連中... (${timeLeft}s)`, '#f59e0b');
            callbacks.onToast(`⚠️ 連線中斷！正在嘗試重新連線 (剩餘 ${timeLeft} 秒)...`, true);

            // 客戶端 (白棋) 主動重連
            if (p2pMyColor === 2 && oppId) {
                let attempts = 0;
                if (reconnectInterval) clearInterval(reconnectInterval);
                reconnectInterval = setInterval(() => {
                    attempts++;
                    if (!state.p2pReconnecting || attempts > 10 || this.isConnected()) {
                        clearInterval(reconnectInterval);
                        reconnectInterval = null;
                        return;
                    }
                    console.log(`P2P Reconnection attempt ${attempts} to ${oppId}...`);
                    this.connect(oppId);
                }, 3000);
            }

            // 倒數計時器
            if (reconnectCountdownTimer) clearInterval(reconnectCountdownTimer);
            reconnectCountdownTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0 || !state.p2pReconnecting) {
                    clearInterval(reconnectCountdownTimer);
                    reconnectCountdownTimer = null;
                    if (state.p2pReconnecting) {
                        // 超時未連上
                        state.p2pReconnecting = false;
                        state.isGameOver = true;
                        localStorage.removeItem('gomoku_p2p_autosave');
                        p2pMyColor = null;
                        callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
                        callbacks.onToast('⚠️ 對手已斷開連線，對局終止', true);
                        callbacks.onClose();
                    }
                } else {
                    callbacks.onStatusChange(`斷線重連中... (${timeLeft}s)`, '#f59e0b');
                }
            }, 1000);
        } else if (!state.p2pReconnecting) {
            p2pMyColor = null;
            callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
            callbacks.onClose();
        }
    },

    close() {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
        if (reconnectCountdownTimer) {
            clearInterval(reconnectCountdownTimer);
            reconnectCountdownTimer = null;
        }
        localStorage.removeItem('gomoku_p2p_autosave');
        state.p2pReconnecting = false;

        if (p2pConn) {
            p2pConn.close();
        }
        
        // 關閉所有觀戰者連線
        if (spectatorConns && spectatorConns.length > 0) {
            spectatorConns.forEach(conn => {
                try { conn.close(); } catch(e) {}
            });
            spectatorConns = [];
        }
        
        this.stopVoice();
        this.unregisterRoom();

        if (lobbySocket) {
            try { lobbySocket.close(); } catch(e) {}
            lobbySocket = null;
        }
        lobbyRoomsMap.clear();

        if (peer) {
            peer.destroy();
            peer = null;
        }
        p2pConn = null;
        p2pMyColor = null;
        oppId = null;
    },

    getMyColor() {
        return p2pMyColor;
    },

    isConnected() {
        return p2pConn && p2pConn.open;
    },

    getOpponentId() {
        return oppId;
    },

    getMyPeerId() {
        return peer ? peer.id : null;
    },

    // 廣播給對手與所有旁觀者 (v2.0.0)
    broadcast(msg) {
        this.sendMessage(msg);
        if (spectatorConns && spectatorConns.length > 0) {
            spectatorConns.forEach(conn => {
                if (conn && conn.open) {
                    conn.send(msg);
                }
            });
        }
    },

    // 設置旁觀者連線 (v2.0.0)
    setupSpectatorConnection(conn) {
        conn.on('open', () => {
            console.log("Spectator connection established:", conn.peer);
            callbacks.onToast("👁️ 新的旁觀者加入觀戰");
            if (callbacks.onSpectatorConnected) {
                callbacks.onSpectatorConnected(conn);
            }
        });

        conn.on('data', (data) => {
            // 旁觀者發言
            callbacks.onData({
                ...data,
                fromSpectator: true,
                senderId: conn.peer
            });
        });

        conn.on('close', () => {
            console.log("Spectator connection closed:", conn.peer);
            spectatorConns = spectatorConns.filter(c => c.peer !== conn.peer);
        });

        conn.on('error', (err) => {
            console.error("Spectator connection error:", err);
            conn.close();
        });
    },

    // ==========================================================================
    // WebSocket 公共大廳房間控制 + WebSockets 毫秒同步 (v2.0.0)
    // ==========================================================================
    initLobbySocket(onUpdate) {
        lobbyCallback = onUpdate;
        if (lobbySocket && (lobbySocket.readyState === WebSocket.OPEN || lobbySocket.readyState === WebSocket.CONNECTING)) {
            this.broadcastLobbyEvent({ type: 'request_room_list' });
            return;
        }
        
        if (lobbyConnectFailCount >= 3) {
            console.warn("WebSocket Lobby connection failed repeatedly, auto-reconnect paused.");
            if (lobbyCallback) {
                lobbyCallback(null, new Error('Lobby connection paused'));
            }
            return;
        }

        try {
            // 使用 socketsbay 的免費公用 WebSocket 測試信道
            lobbySocket = new WebSocket('wss://socketsbay.com/wss/v2/1/demo/');
            
            lobbySocket.onopen = () => {
                console.log("WebSocket Lobby connected.");
                lobbyConnectFailCount = 0;
                this.broadcastLobbyEvent({ type: 'request_room_list' });
                if (lobbyCallback) {
                    lobbyCallback(Array.from(lobbyRoomsMap.values()), null);
                }
            };
            
            lobbySocket.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.project !== 'cyber_gomoku_lobby') return;
                    
                    if (data.type === 'request_room_list') {
                        // 如果自己是房主，將當前註冊的房間廣播出去
                        const saved = localStorage.getItem('gomoku_registered_room');
                        if (saved && peer && peer.id) {
                            const roomObj = JSON.parse(saved);
                            if (roomObj.id === peer.id) {
                                this.broadcastLobbyEvent({
                                    type: 'room_created',
                                    room: roomObj
                                });
                            }
                        }
                    } else if (data.type === 'room_created') {
                        // 收到新房間廣播，存入本地 Map
                        lobbyRoomsMap.set(data.room.id, data.room);
                        if (lobbyCallback) {
                            lobbyCallback(Array.from(lobbyRoomsMap.values()), null);
                        }
                    } else if (data.type === 'room_closed') {
                        // 移除已關閉房間
                        if (lobbyRoomsMap.delete(data.id)) {
                            if (lobbyCallback) {
                                lobbyCallback(Array.from(lobbyRoomsMap.values()), null);
                            }
                        }
                    }
                } catch (err) {
                    // 忽略 JSON 解析異常
                }
            };
            
            lobbySocket.onerror = (err) => {
                console.warn("WebSocket Lobby connection error:", err);
                lobbyConnectFailCount++;
                if (lobbyCallback) {
                    lobbyCallback(null, err);
                }
            };
            
            lobbySocket.onclose = () => {
                console.log("WebSocket Lobby disconnected.");
                if (lobbyCallback && lobbyConnectFailCount > 0) {
                    lobbyCallback(null, new Error('Disconnected'));
                }
            };
        } catch (e) {
            console.warn("Failed to initialize WebSocket lobby:", e);
            lobbyConnectFailCount++;
            if (lobbyCallback) {
                lobbyCallback(null, e);
            }
        }
    },

    resetLobbyRetry() {
        console.log("Manual reset of Lobby connection retry count.");
        lobbyConnectFailCount = 0;
        if (lobbyCallback) {
            this.initLobbySocket(lobbyCallback);
        }
    },

    broadcastLobbyEvent(msg) {
        if (lobbySocket && lobbySocket.readyState === WebSocket.OPEN) {
            try {
                lobbySocket.send(JSON.stringify({
                    project: 'cyber_gomoku_lobby',
                    ...msg
                }));
            } catch (e) {
                console.warn("Failed to send WebSocket lobby event:", e);
            }
        }
    },

    async registerRoom(roomName, rulesMode) {
        if (!peer || !peer.id) return;
        const roomData = {
            id: peer.id,
            name: roomName || `房間_${peer.id.slice(0, 4)}`,
            rulesMode: rulesMode || 'standard',
            timestamp: Date.now()
        };
        // 本地暫存，以便其他 client request 時隨時重發
        localStorage.setItem('gomoku_registered_room', JSON.stringify(roomData));

        // WebSocket 廣播事件
        if (!lobbySocket || lobbySocket.readyState !== WebSocket.OPEN) {
            this.initLobbySocket(lobbyCallback);
        }
        setTimeout(() => {
            this.broadcastLobbyEvent({
                type: 'room_created',
                room: roomData
            });
        }, 600);
    },

    async unregisterRoom() {
        if (!peer || !peer.id) return;
        localStorage.removeItem('gomoku_registered_room');

        // WebSocket 廣播關閉事件
        this.broadcastLobbyEvent({
            type: 'room_closed',
            id: peer.id
        });
    },

    async fetchRooms(callback) {
        // 保存 callback 以便 WebSocket 收到資料時回調
        lobbyCallback = callback;

        // 如果 WebSocket lobby 還沒有建立連線，主動初始化它
        if (!lobbySocket || (lobbySocket.readyState !== WebSocket.OPEN && lobbySocket.readyState !== WebSocket.CONNECTING)) {
            if (lobbyConnectFailCount >= 3) {
                callback(null, new Error('Lobby connection paused due to multiple failures'));
                return;
            }
            this.initLobbySocket(callback);
            return;
        }

        // 如果 WebSocket lobby 連接可用，優先回傳當前 Map 快照並請求更新
        if (lobbySocket && lobbySocket.readyState === WebSocket.OPEN) {
            this.broadcastLobbyEvent({ type: 'request_room_list' });
            callback(Array.from(lobbyRoomsMap.values()), null);
        } else if (lobbySocket && lobbySocket.readyState === WebSocket.CONNECTING) {
            // 連線中，暫不做處理，等待 onopen 觸發 callback
        } else {
            callback(null, new Error('Lobby is offline'));
        }
    },

    // ==========================================================================
    // WebRTC 語音通話 (v2.0.0)
    // ==========================================================================
    voiceCall: null,
    localStream: null,

    async startVoice(oppPeerId, localStream, remoteAudioEl, onStreamCallback) {
        if (!peer || peer.destroyed) return;
        this.localStream = localStream;
        
        try {
            const call = peer.call(oppPeerId, localStream);
            this.voiceCall = call;
            
            call.on('stream', (remoteStream) => {
                if (remoteAudioEl) {
                    remoteAudioEl.srcObject = remoteStream;
                }
                if (onStreamCallback) onStreamCallback(remoteStream);
            });

            call.on('close', () => {
                this.stopVoice();
            });
            
            call.on('error', (err) => {
                console.error("Voice call error:", err);
                this.stopVoice();
            });
        } catch (err) {
            console.error("Failed to start voice call:", err);
            this.stopVoice();
        }
    },

    answerVoice(call, localStream, remoteAudioEl, onStreamCallback) {
        this.voiceCall = call;
        this.localStream = localStream;
        
        try {
            call.answer(localStream);
            
            call.on('stream', (remoteStream) => {
                if (remoteAudioEl) {
                    remoteAudioEl.srcObject = remoteStream;
                }
                if (onStreamCallback) onStreamCallback(remoteStream);
            });

            call.on('close', () => {
                this.stopVoice();
            });
            
            call.on('error', (err) => {
                console.error("Voice call error:", err);
                this.stopVoice();
            });
        } catch (err) {
            console.error("Failed to answer voice call:", err);
            this.stopVoice();
        }
    },

    stopVoice() {
        if (this.voiceCall) {
            this.voiceCall.close();
            this.voiceCall = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }
};
