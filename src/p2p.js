import { state } from './game.js';

let peer = null;
let p2pConn = null;
let p2pMyColor = null; // 1: 黑, 2: 白
let oppId = null; // 對手 Peer ID
let pingInterval = null;
let lastHeartbeatReceived = 0;
let reconnectInterval = null;
let reconnectCountdownTimer = null;

let callbacks = {
    onStatusChange: (status, color) => {},
    onToast: (msg, isAlert) => {},
    onConnected: (id) => {},
    onPeerConnected: (oppId, myColor) => {},
    onData: (data) => {},
    onClose: () => {}
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
            callbacks.onStatusChange('等待對手連線...', 'var(--accent-primary)');
        });

        // 接收連接
        peer.on('connection', (conn) => {
            if (p2pConn && p2pConn.open) {
                conn.close();
                return;
            }

            p2pConn = conn;
            p2pMyColor = 1; // 房主先手黑棋
            this.setupConnection(conn);
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
    }
};
