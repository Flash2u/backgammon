import { game, state } from './src/game.js?t=1782411137000';
import { ui } from './src/ui.js?t=1782411137000';
import { audio } from './src/audio.js?t=1782411137000';
import { p2p } from './src/p2p.js?t=1782411137000';



function startApp() {
    console.log("🚀 [App] 應用程式初始化成功。版本：3.5.0");
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
    // ==========================================================================
    // 計時器控制
    // ==========================================================================
    function startTimer() {
        stopTimer();
        
        // 每次落子或悔棋時，如果有限時規則，則重置狀態剩餘秒數
        if (state.timeLimitRule !== 'none') {
            state.roundSecondsLeft = game.getTimeLimitSeconds();
            ui.updateTimerUI(state.roundSecondsLeft, true);
        } else {
            ui.updateTimerUI(gameSeconds, false);
        }

        timerInterval = setInterval(() => {
            gameSeconds++;
            if (state.timeLimitRule !== 'none') {
                state.roundSecondsLeft--;
                ui.updateTimerUI(state.roundSecondsLeft, true);

                // 剩餘 10 秒內播放警示嗶聲
                if (state.roundSecondsLeft <= 10 && state.roundSecondsLeft > 0) {
                    audio.playCountdownBeep(state.roundSecondsLeft);
                }

                if (state.roundSecondsLeft <= 0) {
                    handleTimeout();
                }
            } else {
                ui.updateTimerUI(gameSeconds, false);
            }
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
        ui.updateTimerUI(0, false);
    }

    // 處理超時輸局
    function handleTimeout() {
        stopTimer();
        state.isGameOver = true;
        
        const loserColor = state.currentTurn;
        const winnerColor = 3 - loserColor;
        
        game.updateStats(winnerColor);

        // 如果是 P2P 模式，且是我超時，需要通知對手
        if (state.gameMode === 'p2p' && p2p.isConnected()) {
            if (loserColor === p2p.getMyColor()) {
                p2p.broadcast({
                    type: 'timeout',
                    loser: loserColor
                });
            }
        }

        ui.updateStatsUI(state.stats);
        setTimeout(() => {
            if (state.gameMode === 'ai') {
                if (winnerColor === state.playerColor) {
                    audio.playWin();
                } else {
                    audio.playLose();
                }
            } else {
                audio.playWin();
            }
            ui.showGameEndModal(winnerColor, [], true); // 加上 isTimeout = true 標記
        }, 300);
    }

    // ==========================================================================
    // 遊戲狀態重置與同步
    // ==========================================================================
    function showStartToast() {
        if (state.history.length > 0) return; // 如果已經有落子歷史，就不再顯示開局提示
        let toastText = '';
        if (state.gameMode === 'ai') {
            if (state.playerColor === 1) {
                toastText = '🎮 遊戲開始：您執黑棋先手。請您 (黑棋) 先手落子';
            } else {
                toastText = '🎮 遊戲開始：您執白棋後手。AI (黑棋) 思考落子中...';
            }
        } else if (state.gameMode === 'p2p') {
            if (p2p.getMyColor() === 1) {
                toastText = '⚡ 遊戲開始：您執黑棋先手。請您 (黑棋) 先手落子';
            } else {
                toastText = '⚡ 遊戲開始：您執白棋後手。等待對手 (黑棋) 落子...';
            }
        } else {
            toastText = '👥 遊戲開始：黑棋先手，白棋後手。請黑棋先手落子';
        }
        ui.showBoardStartToast(toastText);
    }

    function resetGame() {
        game.reset();
        resetTimer();
        
        // 重置 AI 託管狀態
        state.isLocalHosting = false;
        const btnHosting = document.getElementById('btn-p2p-hosting');
        if (btnHosting) {
            btnHosting.classList.remove('active');
            btnHosting.innerHTML = '<span class="btn-icon">🤖</span> 啟動 AI 託管代打';
        }
        
        // P2P 模式下，同步我的顏色給 UI
        if (state.gameMode === 'p2p' && p2p.isConnected()) {
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
        showStartToast();

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
        ui.clearVirtualAIStones();
    }

    // ==========================================================================
    // 落子核心控制工作流
    // ==========================================================================
    function handleCellClick(r, c) {
        if (state.isGameOver || state.isAiThinking || isUndoing || state.isSpectator) return;
        
        // 攔截殘局編輯點擊
        if (ui.isPuzzleEditing) {
            const activeToolBtn = document.querySelector('#puzzle-edit-tool button.active');
            const tool = activeToolBtn ? activeToolBtn.dataset.tool : 'black';
            if (tool === 'black') {
                state.board[r][c] = 1;
                audio.playStone();
            } else if (tool === 'white') {
                state.board[r][c] = 2;
                audio.playStone();
            } else if (tool === 'erase') {
                state.board[r][c] = 0;
                audio.playStone();
            }
            ui.renderBoard();
            return;
        }

        if (state.board[r][c] !== 0) return;

        // P2P 模式限制
        if (state.gameMode === 'p2p') {
            if (!p2p.isConnected() || state.currentTurn !== p2p.getMyColor()) return;
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

    function executeMove(r, c, isRemote = false) {
        const activeColor = state.currentTurn;
        
        // 播放落子音效與繪製棋子
        audio.playStone();
        ui.renderStone(r, c, activeColor);
        ui.clearVirtualAIStones(); // 清除 AI 預覽虛擬子

        // 如果是第一手，隱藏開局提示
        if (state.history.length === 0) {
            ui.hideBoardStartToast();
        }

        // 更新遊戲核心狀態
        const result = game.makeMove(r, c, activeColor);

        // 如果是 P2P 連線對戰且非遠端同步落子，將落子同步廣播給對手與觀戰者，並附帶盤面唯一的 Zobrist 哈希值
        if (state.gameMode === 'p2p' && p2p.isConnected() && !isRemote) {
            p2p.broadcast({
                type: 'move',
                r: r,
                c: c,
                hash: game.getBoardHash()
            });
        }

        // 殘局模式下，如果是玩家落子，增加已用步數
        if (state.gameMode === 'puzzle' && activeColor === state.playerColor) {
            state.puzzleMovesUsed++;
            if (ui.dom.puzzleUsedText) {
                ui.dom.puzzleUsedText.innerText = state.puzzleMovesUsed;
            }
        }

        // 處理遊戲結局
        if (result.type === 'win') {
            stopTimer();
            ui.updateStatsUI(state.stats);
            state.isGameOver = true;
            
            // 延遲播放勝利/失敗音效並彈出 Modal
            setTimeout(() => {
                if (state.gameMode === 'ai') {
                    if (result.winner === state.playerColor) {
                        audio.playWin();
                    } else {
                        audio.playLose();
                    }
                } else if (state.gameMode === 'puzzle') {
                    if (result.winner === state.playerColor) {
                        audio.playWin();
                    } else {
                        audio.playLose();
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
            state.isGameOver = true;
            setTimeout(() => {
                ui.showGameEndModal(0, []);
            }, 300);
            return;
        }

        // 殘局模式下，檢查是否超步
        if (state.gameMode === 'puzzle' && state.puzzleMaxMoves > 0 && state.puzzleMovesUsed >= state.puzzleMaxMoves) {
            state.isGameOver = true;
            stopTimer();
            setTimeout(() => {
                audio.playLose();
                ui.showGameEndModal(3 - state.playerColor, []); // 對手贏，即挑戰失敗
            }, 300);
            return;
        }

        // 繼續對局，更新提示與回合
        ui.updateTurnUI();
        ui.updateThreatHints(game.getThreatHints(state.hintEnabled));
        ui.updateForbiddenMoves(game.getForbiddenMoves());

        // 重啟計時器
        startTimer();

        // 如果是 AI 模式且輪到 AI
        if (state.gameMode === 'ai' && state.currentTurn !== state.playerColor) {
            triggerAIMove();
        }

        // 殘局模式且輪到 AI (非玩家顏色)
        if (state.gameMode === 'puzzle' && state.currentTurn !== state.playerColor) {
            triggerAIMove();
        }

        // 如果是 P2P 模式，且輪到我，且開啟了 AI 託管
        if (state.gameMode === 'p2p' && p2p.isConnected() && state.currentTurn === p2p.getMyColor() && state.isLocalHosting) {
            setTimeout(() => {
                triggerHostingMove();
            }, 500);
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
            },
            (progress) => {
                ui.updateAIMonitor(progress);
            }
        );
    }

    function triggerHostingMove() {
        if (!state.isLocalHosting || state.currentTurn !== p2p.getMyColor() || state.isGameOver) return;
        
        // 暫時切換 playerColor 為當前顏色以供 AI 搜尋，計算完即還原
        const origPlayerColor = state.playerColor;
        state.playerColor = p2p.getMyColor();
        
        game.triggerAIMove(
            () => {
                state.isAiThinking = true;
                ui.updateTurnUI();
            },
            (bestMove) => {
                state.isAiThinking = false;
                state.playerColor = origPlayerColor;
                if (state.isGameOver) return;

                if (bestMove) {
                    executeMove(bestMove.r, bestMove.c);
                } else {
                    ui.updateTurnUI();
                }
            },
            (progress) => {
                ui.updateAIMonitor(progress);
            }
        );
    }

    // ==========================================================================
    // 悔棋控制
    // ==========================================================================
    function undoMove() {
        if (state.history.length === 0 || state.isGameOver || state.isAiThinking || isUndoing) return;

        // P2P 模式下，需徵求對手同意
        if (state.gameMode === 'p2p' && p2p.isConnected()) {
            if (state.currentTurn !== p2p.getMyColor()) {
                ui.showP2PToast('⚠️ 只有在您的回合才能申請悔棋', true);
                return;
            }
            ui.showP2PToast('已向對手發送悔棋請求，等待回應...');
            p2p.broadcast({ type: 'undo-request' });
            return;
        }

        // 人機對抗與殘局悔棋需要回退 2 步 (玩家+AI)，本地雙人回退 1 步
        const steps = (state.gameMode === 'ai' || state.gameMode === 'puzzle') ? 2 : 1;
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

        // 殘局模式下，扣減已用步數
        if (state.gameMode === 'puzzle') {
            state.puzzleMovesUsed = Math.max(0, state.puzzleMovesUsed - 1);
            if (ui.dom.puzzleUsedText) {
                ui.dom.puzzleUsedText.innerText = state.puzzleMovesUsed;
            }
        }

        // 執行 UI 動畫
        let animCount = undoResult.removedStones.length;
        if (animCount === 0) {
            syncGameUI();
            if (state.history.length === 0) {
                showStartToast();
            }
            isUndoing = false;
        } else {
            undoResult.removedStones.forEach(({ r, c }) => {
                ui.animateUndoStone(r, c, () => {
                    animCount--;
                    if (animCount === 0) {
                        syncGameUI();
                        if (state.history.length === 0) {
                            showStartToast();
                        }
                        isUndoing = false;
                    }
                });
            });
        }
    }

    // ==========================================================================
    // P2P 連線數據包接收器 (v2.0.0)
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
                showStartToast();
                break;

            case 'move':
                if (state.currentTurn !== p2p.getMyColor() && !state.isSpectator) {
                    const opponentColor = 3 - p2p.getMyColor();
                    // 1. 強制防作弊校驗
                    if (data.r < 0 || data.r >= 15 || data.c < 0 || data.c >= 15) {
                        ui.showP2PToast('⚠️ 偵測到非法越界落子，已中斷連線！', true);
                        p2p.close();
                        return;
                    }
                    if (state.board[data.r][data.c] !== 0) {
                        ui.showP2PToast('⚠️ 偵測到覆蓋棋子作弊，已中斷連線！', true);
                        p2p.close();
                        return;
                    }
                    if (state.rulesMode === 'renju' && opponentColor === 1) {
                        if (game.checkForbidden(data.r, data.c)) {
                            ui.showP2PToast('⚠️ 偵測到違反黑棋禁手落子，已中斷連線！', true);
                            p2p.close();
                            return;
                        }
                    }

                    executeMove(data.r, data.c, true);

                    // 2. 哈希一致性校驗與自愈
                    const localHash = game.getBoardHash();
                    if (data.hash !== undefined && localHash !== data.hash) {
                        console.warn(`Hash mismatch! Local: ${localHash}, Remote: ${data.hash}. Requesting self-healing...`);
                        p2p.broadcast({ type: 'sync-request' });
                    }
                } else if (state.isSpectator) {
                    // 旁觀者唯讀同步落子
                    audio.playStone();
                    ui.renderStone(data.r, data.c, state.currentTurn);
                    game.makeMove(data.r, data.c, state.currentTurn);
                    ui.updateTurnUI();
                    ui.updateThreatHints(game.getThreatHints(state.hintEnabled));
                    ui.updateForbiddenMoves(game.getForbiddenMoves());
                    startTimer();
                }
                break;

            case 'sync-request':
                // 收到自愈同步請求，將完整盤面與歷史發送給對手或旁觀者
                p2p.broadcast({
                    type: 'sync-response',
                    board: state.board,
                    currentTurn: state.currentTurn,
                    history: state.history,
                    lastMove: state.lastMove,
                    rulesMode: state.rulesMode
                });
                break;

            case 'sync-response':
                // 執行狀態自愈覆蓋與重繪
                state.board = data.board;
                state.currentTurn = data.currentTurn;
                state.history = data.history;
                state.lastMove = data.lastMove;
                state.rulesMode = data.rulesMode;
                
                ui.updateSettingButtons('rulesMode', state.rulesMode);
                syncGameUI();
                startTimer();
                ui.showP2PToast('⚡ 盤面數據已自動校驗重組！');
                break;

            case 'undo-request':
                ui.showP2PConfirmModal(
                    '悔棋請求',
                    '對手請求悔棋，請問是否同意？',
                    () => {
                        p2p.broadcast({ type: 'undo-response', accept: true });
                        const steps = state.history.length >= 2 ? 2 : 1;
                        performUndo(steps);
                        ui.showP2PToast('您同意了對手的悔棋請求');
                    },
                    () => {
                        p2p.broadcast({ type: 'undo-response', accept: false });
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
                        p2p.broadcast({ type: 'restart-response', accept: true });
                        resetGame();
                        ui.showP2PToast('重新對局開始！');
                    },
                    () => {
                        p2p.broadcast({ type: 'restart-response', accept: false });
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
                p2p.broadcast({
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

            case 'timeout':
                stopTimer();
                state.isGameOver = true;
                const winnerColor = 3 - data.loser;
                game.updateStats(winnerColor);
                ui.updateStatsUI(state.stats);
                setTimeout(() => {
                    audio.playWin();
                    ui.showGameEndModal(winnerColor, [], true);
                }, 300);
                break;

            case 'chat':
                if (data.fromSpectator) {
                    ui.appendChatMessage(`旁觀者_${data.senderId.slice(0, 4)}`, data.text, 'opponent');
                    if (ui.danmakuSystem) {
                        ui.danmakuSystem.addDanmaku(data.text);
                    }
                    // 房主轉發消息給對手與所有旁觀者
                    if (p2p.getMyColor() === 1) {
                        p2p.broadcast({
                            type: 'chat',
                            text: data.text,
                            fromSpectator: true,
                            senderId: data.senderId
                        });
                    }
                } else {
                    ui.appendChatMessage('對手', data.text, 'opponent');
                    if (state.isSpectator && ui.danmakuSystem) {
                        ui.danmakuSystem.addDanmaku(data.text);
                    }
                }
                break;

            case 'emoji':
                if (data.fromSpectator) {
                    ui.appendChatMessage(`旁觀者_${data.senderId.slice(0, 4)}`, data.emoji, 'opponent');
                    ui.showFloatingEmoji(data.emoji);
                    if (ui.danmakuSystem) {
                        ui.danmakuSystem.addDanmaku(data.emoji);
                    }
                    if (p2p.getMyColor() === 1) {
                        p2p.broadcast({
                            type: 'emoji',
                            emoji: data.emoji,
                            fromSpectator: true,
                            senderId: data.senderId
                        });
                    }
                } else {
                    ui.appendChatMessage('對手', data.emoji, 'opponent');
                    ui.showFloatingEmoji(data.emoji);
                    if (state.isSpectator && ui.danmakuSystem) {
                        ui.danmakuSystem.addDanmaku(data.emoji);
                    }
                }
                break;
        }
    }

    // ==========================================================================
    // 大廳輪詢機制 (v2.0.0)
    // ==========================================================================
    let lobbyPollInterval = null;
    function startLobbyPolling() {
        stopLobbyPolling();
        const poll = () => {
            if (state.gameMode === 'p2p' && !p2p.isConnected()) {
                p2p.fetchRooms((rooms, error) => {
                    ui.renderLobbyRooms(rooms, error);
                });
            }
        };
        poll();
        lobbyPollInterval = setInterval(poll, 5000); // 每 5 秒輪詢一次
    }

    function stopLobbyPolling() {
        if (lobbyPollInterval) {
            clearInterval(lobbyPollInterval);
            lobbyPollInterval = null;
        }
    }

    // ==========================================================================
    // WebRTC 語音通話控制 (v2.0.0)
    // ==========================================================================
    let localVoiceStream = null;
    async function toggleVoice() {
        if (p2p.voiceCall) {
            // 關閉語音
            p2p.stopVoice();
            if (localVoiceStream) {
                localVoiceStream.getTracks().forEach(t => t.stop());
                localVoiceStream = null;
            }
            ui.setVoiceUIActive(false);
            ui.showP2PToast('🎙️ 語音通話已關閉');
        } else {
            // 開啟語音
            try {
                ui.setVoiceUIActive(false, true);
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });
                localVoiceStream = stream;
                
                const oppId = p2p.getOpponentId();
                const remoteAudio = document.getElementById('p2p-remote-audio');
                
                p2p.startVoice(oppId, stream, remoteAudio, () => {
                    ui.setVoiceUIActive(true);
                    ui.showP2PToast('🎙️ 語音通話已連線');
                });
            } catch (err) {
                console.error("Failed to open microphone:", err);
                ui.setVoiceUIActive(false);
                ui.showP2PToast('⚠️ 無法取得麥克風，請檢查權限', true);
            }
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
                if (state.gameMode === 'p2p' && p2p.isConnected()) {
                    ui.showP2PToast('已向對手發送重新對局請求...');
                    p2p.broadcast({ type: 'restart-request' });
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
            onP2PCreateRoom: (roomName) => {
                const myId = document.getElementById('p2p-my-id').innerText;
                if (!myId || myId === '---') {
                    ui.showP2PToast('⚠️ 信令伺服器尚未連線成功，無法創建房間！', true);
                    return;
                }
                p2p.registerRoom(roomName, state.rulesMode);
                ui.showP2PToast(`📢 房間 "${roomName || '五子棋對決'}" 已公開，等待對手中...`);
            },
            onP2PVoiceToggle: () => toggleVoice(),
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
                state.gameMode = 'p2p';
                ui.updateSettingButtons('gameMode', 'p2p');
                p2p.connect(peerId);
            },
            onSendChat: (text) => {
                if (state.gameMode === 'p2p' && p2p.isConnected()) {
                    p2p.broadcast({
                        type: 'chat',
                        text: text
                    });
                    ui.appendChatMessage('我', text, 'me');
                } else if (state.isSpectator) {
                    p2p.broadcast({
                        type: 'chat',
                        text: text,
                        fromSpectator: true,
                        senderId: p2p.getMyPeerId ? p2p.getMyPeerId() : 'spec'
                    });
                    ui.appendChatMessage('我(觀戰)', text, 'me');
                }
            },
            onSendEmoji: (emoji) => {
                if (state.gameMode === 'p2p' && p2p.isConnected()) {
                    p2p.broadcast({
                        type: 'emoji',
                        emoji: emoji
                    });
                    ui.appendChatMessage('我', emoji, 'me');
                    ui.showFloatingEmoji(emoji);
                } else if (state.isSpectator) {
                    p2p.broadcast({
                        type: 'emoji',
                        emoji: emoji,
                        fromSpectator: true,
                        senderId: p2p.getMyPeerId ? p2p.getMyPeerId() : 'spec'
                    });
                    ui.appendChatMessage('我(觀戰)', emoji, 'me');
                    ui.showFloatingEmoji(emoji);
                }
            },
            onSettingChange: (name, value) => {
                if (name === 'gameMode') {
                    if (value === 'p2p') {
                        p2p.init();
                        startLobbyPolling();
                    } else {
                        stopLobbyPolling();
                        p2p.close();
                        state.isSpectator = false;
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
                    
                    if (state.gameMode === 'p2p' && p2p.isConnected()) {
                        p2p.broadcast({
                            type: 'sync-settings',
                            rulesMode: value
                        });
                    }
                } else if (name === 'timeLimitRule') {
                    state.timeLimitRule = value;
                    ui.updateSettingButtons('timeLimitRule', value);
                    resetGame();
                }
            },
            isP2PConnected: () => p2p.isConnected(),
            getP2PMyColor: () => p2p.getMyColor(),
            onAITrigger: () => triggerAIMove(),
            onP2PHostingToggle: () => {
                state.isLocalHosting = !state.isLocalHosting;
                const btnHosting = document.getElementById('btn-p2p-hosting');
                if (state.isLocalHosting) {
                    if (btnHosting) {
                        btnHosting.classList.add('active');
                        btnHosting.innerHTML = '<span class="btn-icon">🤖</span> 取消 AI 託管代打';
                    }
                    ui.showP2PToast('🤖 已開啟 AI 託管代打，將自動為您落子！');
                    if (state.currentTurn === p2p.getMyColor() && !state.isGameOver) {
                        triggerHostingMove();
                    }
                } else {
                    if (btnHosting) {
                        btnHosting.classList.remove('active');
                        btnHosting.innerHTML = '<span class="btn-icon">🤖</span> 啟動 AI 託管代打';
                    }
                    ui.showP2PToast('👤 已關閉 AI 託管，恢復手動操作');
                }
            }
        });

        // 2. 初始化 P2P
        p2p.init({
            onStatusChange: (status, color) => ui.setP2PStatus(status, color),
            onToast: (msg, isAlert) => ui.showP2PToast(msg, isAlert),
            onConnected: (id) => {
                ui.setP2PMyId(id);
                
                // 檢查是否從 URL 觀戰/對戰連結進入
                const urlParams = new URLSearchParams(window.location.search);
                const roomId = urlParams.get('room');
                const isSpectate = urlParams.get('spectate') === '1';
                
                if (roomId && roomId !== id) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    state.gameMode = 'p2p';
                    ui.updateSettingButtons('gameMode', 'p2p');
                    startLobbyPolling(); // 確保客方大廳也正常開始輪詢更新，不卡死在載入中
                    
                    if (isSpectate) {
                        state.isSpectator = true;
                        ui.showP2PToast('👁️ 正在進入觀戰模式...');
                        p2p.connectSpectator(roomId);
                    } else {
                        ui.showP2PToast('🔌 正在與房主連線，請稍後...');
                        p2p.connect(roomId);
                    }
                }
            },
            onPeerConnected: (oppId, myColor) => {
                if (state.gameMode !== 'p2p') {
                    state.gameMode = 'p2p';
                    ui.updateSettingButtons('gameMode', 'p2p');
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
                if (state.isGameOver) return;
                ui.showP2PToast('🔌 對手已斷線！已自動為對手啟用 AI 託管代打。', true);
                state.gameMode = 'ai';
                ui.updateSettingButtons('gameMode', 'ai');
                ui.updateTurnUI(); // 重新整理狀態欄文字為人機對戰提示，避免殘留等待連線
                if (state.currentTurn !== state.playerColor) {
                    triggerAIMove();
                }
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}













