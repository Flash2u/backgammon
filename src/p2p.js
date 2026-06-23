import { state } from './game.js?v=2.6.0';

let peer = null;
let p2pConn = null;
let p2pMyColor = null; // 1: 黑, 2: 白
let oppId = null; // 對手 Peer ID
let pingInterval = null;
let lastHeartbeatReceived = 0;
let reconnectInterval = null;
let reconnectCountdownTimer = null;
let connectTimeoutTimer = null;
let spectatorConns = [];
let p2pSuccessfullyConnected = false;
let isRoomHost = false;

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
        console.log("🚀 [P2P] 模組初始化成功。版本：2.6.0 (方案 A 直連/TURN版)");

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
            debug: 3,
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
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:stun.xten.com' },
                    { urls: 'stun:stun.ekiga.net' },
                    { urls: 'stun:stun.ideasip.com' },
                    { urls: 'stun:stun.schlund.de' },
                    { urls: 'stun:stun.stunprotocol.org:3478' },
                    // 免費公開 TURN 伺服器，解決對稱型 NAT 連線失敗問題
                    {
                        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:3478',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
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
            if (!peer || peer.destroyed) return;
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
        
        p2pSuccessfullyConnected = false;
        isRoomHost = false;
        callbacks.onStatusChange('連線對手中...', 'var(--text-secondary)');
        p2pMyColor = 2; // 客方白棋後手
        
        if (connectTimeoutTimer) {
            clearTimeout(connectTimeoutTimer);
        }
        
        const conn = peer.connect(targetId);
        p2pConn = conn;
        this.setupConnection(conn);
        
        // 15 秒 WebRTC 連線與穿透超時偵測
        connectTimeoutTimer = setTimeout(() => {
            if (p2pConn && !p2pConn.open) {
                console.warn("P2P connection establishment timeout. Likely WebRTC hole punching failed.");
                callbacks.onToast('⚠️ 連線超時！雙方網路可能存在防火牆或 NAT 限制，導致 WebRTC 穿透失敗。', true);
                
                // 僅關閉連線，不要銷毀 peer 實例
                const tempConn = p2pConn;
                p2pConn = null;
                if (tempConn) {
                    try { tempConn.close(); } catch(e) {}
                }
                this.handleClose();
            }
        }, 15000);
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
            p2pSuccessfullyConnected = true;
            // 清除連線超時計時器
            if (connectTimeoutTimer) {
                clearTimeout(connectTimeoutTimer);
                connectTimeoutTimer = null;
            }
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
        // 清除連線超時計時器
        if (connectTimeoutTimer) {
            clearTimeout(connectTimeoutTimer);
            connectTimeoutTimer = null;
        }
        // 清除心跳包
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        const wasConnected = (p2pConn !== null);
        const wasConnectedSuccessfully = p2pSuccessfullyConnected;
        p2pSuccessfullyConnected = false;
        
        // 暫存斷線前的角色顏色，供決定狀態時使用
        const prevColor = p2pMyColor;
        p2pConn = null;

        // 只有在曾經成功連線過、且遊戲仍在進行時，才開啟 30 秒自動重連
        if (wasConnectedSuccessfully && wasConnected && state.gameMode === 'p2p' && !state.isGameOver && !state.p2pReconnecting) {
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
                        const lastColor = p2pMyColor;
                        p2pMyColor = null;
                        if (lastColor === 2 || lastColor === 0) {
                            callbacks.onStatusChange('信令伺服器已連線 (準備就緒)', 'var(--accent-secondary)');
                        } else {
                            callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
                        }
                        callbacks.onToast('⚠️ 對手已斷開連線，對局終止', true);
                        callbacks.onClose();
                    }
                } else {
                    callbacks.onStatusChange(`斷線重連中... (${timeLeft}s)`, '#f59e0b');
                }
            }, 1000);
        } else if (!state.p2pReconnecting) {
            p2pMyColor = null;
            if (prevColor === 2 || prevColor === 0) {
                callbacks.onStatusChange('信令伺服器已連線 (準備就緒)', 'var(--accent-secondary)');
            } else {
                callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
            }
            // 只有在曾經成功連線的情況下，才回調 onClose，避免未連線成功被誤判為斷線
            if (wasConnectedSuccessfully) {
                callbacks.onClose();
            }
        }
    },

    close() {
        p2pSuccessfullyConnected = false;
        isRoomHost = false;
        if (connectTimeoutTimer) {
            clearTimeout(connectTimeoutTimer);
            connectTimeoutTimer = null;
        }
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

        // 只有當遊戲模式不再是 P2P 時，才真正釋放大廳 Socket
        // 否則，保持大廳 Socket 的連線，以免每 5 秒大廳輪詢時重複連線
        if (state.gameMode !== 'p2p') {
            if (lobbySocket) {
                try {
                    lobbySocket.onerror = null;
                    lobbySocket.onclose = null;
                    lobbySocket.close();
                } catch(e) {}
                lobbySocket = null;
            }
            lobbyRoomsMap.clear();
        }

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

    initLobbySocket(onUpdate) {
        lobbyCallback = onUpdate;
        console.log("WebSocket Lobby is disabled in v2.0.5");
        if (lobbyCallback) {
            lobbyCallback([], null);
        }
    },

    resetLobbyRetry() {
        // 大廳重試已停用
    },

    broadcastLobbyEvent(msg) {
        // 大廳廣播已停用
    },

    async registerRoom(roomName, rulesMode) {
        if (!peer || !peer.id) return;
        isRoomHost = true;
    },

    async unregisterRoom() {
        if (!peer || !peer.id) return;
        isRoomHost = false;
    },

    async fetchRooms(callback) {
        lobbyCallback = callback;
        if (callback) {
            callback([], null);
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
    },

    isHost() {
        return isRoomHost;
    }
};











