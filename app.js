import { game, state } from './src/game.js';
import { ui } from './src/ui.js';
import { audio } from './src/audio.js';
import { p2p } from './src/p2p.js';

document.addEventListener('DOMContentLoaded', () => {
    let isUndoing = false;
    let gameSeconds = 0;
    let timerInterval = null;

    // 綁定至 window 供控制台除錯使用
    window.game = game;
    window.state = state;
    window.ui = ui;
    window.audio = audio;
    window.p2p = p2p;

    // ==========================================================================
    // 計時器控制
    // ==========================================================================
    function startTimer() {
        stopTimer();
        timerInterval = setInterval(() => {
            gameSeconds++;
            ui.updateTimerUI(gameSeconds);
        }, 1000);
    }

    // 停止計時器
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // 重設計時器
    function resetTimer() {
        stopTimer();
        gameSeconds = 0;
        ui.updateTimerUI(0);
    }

    // ==========================================================================
    // 遊戲狀態重置與同步
    // ==========================================================================
    function resetGame() {
        game.reset();
        resetTimer();
        
        // P2P 模式下，同步我的顏色給 UI
        if (state.gameMode === 'pvp' && p2p.isConnected()) {
            state.playerColor = p2p.getMyColor();
        } else {
            // 人機模式下每次重開自動輪換玩家顏色，增加樂趣
            if (state.gameMode === 'ai') {
                state.playerColor = state.nextGamePlayerColor;
                state.nextGamePlayerColor = 3 - state.nextGamePlayerColor; // 下次輪換
            } else {
                state.playerColor = 1; // 本地雙人模式預設黑棋先手
            }
        }

        syncGameUI();
        startTimer();

        // 人機對戰下，若玩家是白棋(2)，AI(1)需主動下第一步
        if (state.gameMode === 'ai' && state.playerColor === 2 && !state.isGameOver) {
            triggerAIMove();
        }
    }

    function syncGameUI() {
        ui.renderBoard();
        ui.updateTurnUI();
        ui.updateThreatHints(game.getThreatHints(state.hintEnabled));
        ui.updateForbiddenMoves(game.getForbiddenMoves());
        ui.updateStatsUI(state.stats);
    }

    // ==========================================================================
    // 落子核心控制工作流
    // ==========================================================================
    function handleCellClick(r, c) {
        if (state.isGameOver || state.isAiThinking || isUndoing) return;
        if (state.board[r][c] !== 0) return;

        // P2P 模式限制
        if (state.gameMode === 'pvp' && p2p.isConnected()) {
            if (state.currentTurn !== p2p.getMyColor()) return;
        }

        // 人機對戰模式限制
        if (state.gameMode === 'ai' && state.currentTurn !== state.playerColor) return;

        // 禁手規則檢測 (只有黑棋受限)
        if (state.rulesMode === 'renju' && state.currentTurn === 1) {
            const forbiddenType = game.checkForbidden(r, c);
            if (forbiddenType) {
                audio.playWarning();
                ui.showForbiddenToast(forbiddenType);
                return;
            }
        }

        // 執行落子
        executeMove(r, c);
    }

    function executeMove(r, c) {
        const activeColor = state.currentTurn;
        
        // 播放落子音效與繪製棋子
        audio.playStone();
        ui.renderStone(r, c, activeColor);

        // 更新遊戲核心狀態
        const result = game.makeMove(r, c, activeColor);

        // 如果是 P2P 連線對戰，將落子同步傳給對手
        if (state.gameMode === 'pvp' && p2p.isConnected()) {
            p2p.sendMessage({
                type: 'move',
                r: r,
                c: c
            });
        }

        // 處理遊戲結局
        if (result.type === 'win') {
            stopTimer();
            ui.updateStatsUI(state.stats);
            
            // 延遲播放勝利/失敗音效並彈出 Modal
            setTimeout(() => {
                if (state.gameMode === 'ai') {
                    if (result.winner === state.playerColor) {
                        audio.playWin();
                    } else {
                        audio.playLose(); // 播放失敗音效，增加對抗性
                    }
                } else {
                    audio.playWin();
                }
                ui.showGameEndModal(result.winner, result.stones);
            }, 300);
            return;
        }

        if (result.type === 'draw') {
            stopTimer();
            ui.updateStatsUI(state.stats);
            setTimeout(() => {
                ui.showGameEndModal(0, []);
            }, 300);
            return;
        }

        // 繼續對局，更新提示與回合
        ui.updateTurnUI();
        ui.updateThreatHints(game.getThreatHints(state.hintEnabled));
        ui.updateForbiddenMoves(game.getForbiddenMoves());

        // 如果是 AI 模式且輪到 AI
        if (state.gameMode === 'ai' && state.currentTurn !== state.playerColor) {
            triggerAIMove();
        }
    }

    // ==========================================================================
    // AI 落子觸發
    // ==========================================================================
    function triggerAIMove() {
        game.triggerAIMove(
            () => {
                state.isAiThinking = true;
                ui.updateTurnUI();
            },
            (bestMove) => {
                state.isAiThinking = false;
                if (state.isGameOver) return;

                if (bestMove) {
                    executeMove(bestMove.r, bestMove.c);
                } else {
                    ui.updateTurnUI();
                }
            }
        );
    }

    // ==========================================================================
    // 悔棋控制
    // ==========================================================================
    function undoMove() {
        if (state.history.length === 0 || state.isGameOver || state.isAiThinking || isUndoing) return;

        // P2P 模式下，需徵求對手同意
        if (state.gameMode === 'pvp' && p2p.isConnected()) {
            if (state.currentTurn !== p2p.getMyColor()) {
                ui.showP2PToast('⚠️ 只有在您的回合才能申請悔棋', true);
                return;
            }
            ui.showP2PToast('已向對手發送悔棋請求，等待回應...');
            p2p.sendMessage({ type: 'undo-request' });
            return;
        }

        // 人機對抗悔棋需要回退 2 步 (玩家+AI)，本地雙人回退 1 步
        const steps = state.gameMode === 'ai' ? 2 : 1;
        performUndo(steps);
    }

    function performUndo(steps) {
        isUndoing = true;
        audio.playUndo();

        const undoResult = game.executeUndo(steps);
        if (!undoResult) {
            isUndoing = false;
            return;
        }

        // 執行 UI 動畫
        let animCount = undoResult.removedStones.length;
        if (animCount === 0) {
            syncGameUI();
            isUndoing = false;
        } else {
            undoResult.removedStones.forEach(({ r, c }) => {
                ui.animateUndoStone(r, c, () => {
                    animCount--;
                    if (animCount === 0) {
                        syncGameUI();
                        isUndoing = false;
                    }
                });
            });
        }
    }

    // ==========================================================================
    // P2P 連線數據包接收器
    // ==========================================================================
    function handleP2PData(data) {
        switch (data.type) {
            case 'init':
                // 同步房主的對局與規則
                state.rulesMode = data.rulesMode;
                ui.updateSettingButtons('rulesMode', state.rulesMode);
                state.board = data.board;
                state.currentTurn = data.currentTurn;
                state.lastMove = null;
                state.history = [];
                state.isGameOver = false;
                
                syncGameUI();
                startTimer();
                break;

            case 'move':
                if (state.currentTurn !== p2p.getMyColor()) {
                    executeMove(data.r, data.c);
                }
                break;

            case 'undo-request':
                ui.showP2PConfirmModal(
                    '悔棋請求',
                    '對手請求悔棋，請問是否同意？',
                    () => {
                        p2p.sendMessage({ type: 'undo-response', accept: true });
                        const steps = state.history.length >= 2 ? 2 : 1;
                        performUndo(steps);
                        ui.showP2PToast('您同意了對手的悔棋請求');
                    },
                    () => {
                        p2p.sendMessage({ type: 'undo-response', accept: false });
                        ui.showP2PToast('您拒絕了對手的悔棋請求');
                    }
                );
                break;

            case 'undo-response':
                if (data.accept) {
                    const steps = state.history.length >= 2 ? 2 : 1;
                    performUndo(steps);
                    ui.showP2PToast('對手同意了您的悔棋請求');
                } else {
                    ui.showP2PToast('❌ 對手拒絕了您的悔棋請求', true);
                }
                break;

            case 'restart-request':
                ui.showP2PConfirmModal(
                    '重玩請求',
                    '對手請求重新開始對局，請問是否同意？',
                    () => {
                        p2p.sendMessage({ type: 'restart-response', accept: true });
                        resetGame();
                        ui.showP2PToast('重新對局開始！');
                    },
                    () => {
                        p2p.sendMessage({ type: 'restart-response', accept: false });
                        ui.showP2PToast('您拒絕了重新對局的請求');
                    }
                );
                break;

            case 'restart-response':
                if (data.accept) {
                    resetGame();
                    ui.showP2PToast('對手同意重新開始，對局已重置');
                } else {
                    ui.showP2PToast('❌ 對手拒絕了重新開始對局的請求', true);
                }
                break;

            case 'sync-settings':
                state.rulesMode = data.rulesMode;
                ui.updateSettingButtons('rulesMode', state.rulesMode);
                ui.updateForbiddenMoves(game.getForbiddenMoves());
                ui.showP2PToast(`房主已將規則變更為：${state.rulesMode === 'renju' ? '禁手規則' : '標準規則'}`);
                break;

            case 'reconnect-request':
                p2p.sendMessage({
                    type: 'reconnect-sync',
                    board: state.board,
                    currentTurn: state.currentTurn,
                    history: state.history,
                    lastMove: state.lastMove,
                    rulesMode: state.rulesMode
                });
                ui.showP2PToast('⚡ 對手已重新連線，對局已恢復！');
                state.p2pReconnecting = false;
                syncGameUI();
                startTimer();
                break;

            case 'reconnect-sync':
                state.board = data.board;
                state.currentTurn = data.currentTurn;
                state.history = data.history;
                state.lastMove = data.lastMove;
                state.rulesMode = data.rulesMode;
                state.playerColor = 2; // 客方白棋
                state.p2pReconnecting = false;
                
                ui.updateSettingButtons('rulesMode', state.rulesMode);
                syncGameUI();
                startTimer();
                ui.showP2PToast('⚡ 連線已恢復，對局無縫繼續！');
                break;

            case 'chat':
                ui.appendChatMessage('對手', data.text, 'opponent');
                break;

            case 'emoji':
                ui.appendChatMessage('對手', data.emoji, 'opponent');
                ui.showFloatingEmoji(data.emoji);
                break;
        }
    }

    // ==========================================================================
    // 初始化系統
    // ==========================================================================
    function initGame() {
        game.loadStats();
        
        // 1. 初始化 UI
        ui.init(state, {
            onCellClick: (r, c) => handleCellClick(r, c),
            onRestartClick: () => {
                if (state.gameMode === 'pvp' && p2p.isConnected()) {
                    ui.showP2PToast('已向對手發送重新對局請求...');
                    p2p.sendMessage({ type: 'restart-request' });
                    return;
                }
                if (state.history.length > 0 && !state.isGameOver) {
                    if (confirm('確定要重新開始嗎？目前進度將會遺失。')) {
                        resetGame();
                    }
                } else {
                    resetGame();
                }
            },
            onUndoClick: () => undoMove(),
            onSoundToggle: () => {
                const enabled = audio.toggleSound();
                ui.setSoundButtonUI(enabled);
            },
            onClearStatsClick: () => {
                if (confirm('確定要清除所有對戰數據嗎？此動作無法復原。')) {
                    game.clearStats();
                    ui.updateStatsUI(state.stats);
                }
            },
            onP2PInviteClick: () => {
                const myId = document.getElementById('p2p-my-id').innerText;
                if (!myId || myId === '---') {
                    ui.showP2PToast('⚠️ 正在取得連線 ID，請稍後...', true);
                    return;
                }
                const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${myId}`;
                navigator.clipboard.writeText(inviteUrl).then(() => {
                    const btn = document.getElementById('btn-p2p-invite');
                    btn.innerText = '✅ 已複製連結！';
                    setTimeout(() => {
                        btn.innerText = '🔗 複製邀請連結';
                    }, 2000);
                }).catch(() => {
                    ui.showP2PToast('⚠️ 複製連結失敗，請手動複製 ID', true);
                });
            },
            onP2PConnectClick: (peerId) => {
                if (!peerId) {
                    ui.showP2PToast('⚠️ 請輸入好友的連線 ID', true);
                    return;
                }
                const myId = document.getElementById('p2p-my-id').innerText;
                if (peerId === myId) {
                    ui.showP2PToast('⚠️ 不能與自己進行連線對戰', true);
                    return;
                }
                p2p.connect(peerId);
            },
            onSendChat: (text) => {
                if (state.gameMode === 'pvp' && p2p.isConnected()) {
                    p2p.sendMessage({
                        type: 'chat',
                        text: text
                    });
                    ui.appendChatMessage('我', text, 'me');
                }
            },
            onSendEmoji: (emoji) => {
                if (state.gameMode === 'pvp' && p2p.isConnected()) {
                    p2p.sendMessage({
                        type: 'emoji',
                        emoji: emoji
                    });
                    ui.appendChatMessage('我', emoji, 'me');
                    ui.showFloatingEmoji(emoji);
                }
            },
            onSettingChange: (name, value) => {
                // 處理對弈選項變更
                if (name === 'gameMode') {
                    if (value === 'pvp') {
                        // 切換到 P2P 模式
                        p2p.init();
                    } else {
                        // 斷開並重置 P2P
                        p2p.close();
                    }
                    state.gameMode = value;
                    ui.updateSettingButtons('gameMode', value);
                    resetGame();
                } else if (name === 'aiDifficulty') {
                    state.aiDifficulty = value;
                    ui.updateSettingButtons('aiDifficulty', value);
                } else if (name === 'hintEnabled') {
                    state.hintEnabled = value;
                    ui.updateSettingButtons('hintEnabled', value);
                    ui.updateThreatHints(game.getThreatHints(value));
                } else if (name === 'rulesMode') {
                    state.rulesMode = value;
                    ui.updateSettingButtons('rulesMode', value);
                    resetGame();
                    
                    // 同步給對手
                    if (state.gameMode === 'pvp' && p2p.isConnected()) {
                        p2p.sendMessage({
                            type: 'sync-settings',
                            rulesMode: value
                        });
                    }
                }
            },
            isP2PConnected: () => p2p.isConnected(),
            getP2PMyColor: () => p2p.getMyColor()
        });

        // 2. 初始化 P2P
        p2p.init({
            onStatusChange: (status, color) => ui.setP2PStatus(status, color),
            onToast: (msg, isAlert) => ui.showP2PToast(msg, isAlert),
            onConnected: (id) => {
                ui.setP2PMyId(id);
                // 自動連線檢測
                const urlParams = new URLSearchParams(window.location.search);
                const roomId = urlParams.get('room');
                if (roomId && roomId !== id) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    p2p.connect(roomId);
                }
            },
            onPeerConnected: (oppId, myColor) => {
                if (state.gameMode !== 'pvp') {
                    state.gameMode = 'pvp';
                    ui.updateSettingButtons('gameMode', 'pvp');
                }
                if (myColor === 1) { // 房主
                    if (state.p2pReconnecting) {
                        state.p2pReconnecting = false;
                        return;
                    }
                    resetGame();
                    p2p.sendMessage({
                        type: 'init',
                        rulesMode: state.rulesMode,
                        board: state.board,
                        currentTurn: state.currentTurn
                    });
                }
            },
            onClose: () => {
                state.isGameOver = true;
                stopTimer();
            },
            onData: (data) => handleP2PData(data)
        });

        // 恢復 UI 選項 active 樣式
        ui.updateSettingButtons('gameMode', state.gameMode);
        ui.updateSettingButtons('aiDifficulty', state.aiDifficulty);
        ui.updateSettingButtons('hintEnabled', state.hintEnabled);
        ui.updateSettingButtons('rulesMode', state.rulesMode);

        resetGame();
    }

    initGame();
});
