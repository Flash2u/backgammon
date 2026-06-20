/**
 * app.js
 * 五子棋遊戲主程式 - 負責狀態管理、UI 渲染、事件監聽、音效合成與粒子特效
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // 遊戲狀態變數
    // ==========================================================================
    const BOARD_SIZE = 15;
    let board = [];             // 15x15 二維陣列 (0: 空, 1: 黑, 2: 白)
    let currentTurn = 1;        // 當前輪到 (1: 黑棋, 2: 白棋)
    let isGameOver = false;
    let gameMode = 'ai';        // 'ai' (人機) 或 'pvp' (雙人)
    let aiDifficulty = 'medium';// 'easy', 'medium', 'hard'
    let history = [];           // 悔棋歷史紀錄，存陣列狀態快照
    let lastMove = null;        // 最後落子位置 {r, c}
    let gameSeconds = 0;
    let timerInterval = null;
    let soundEnabled = true;
    let audioCtx = null;
    let isAiThinking = false;   // 避免 AI 思考時玩家重複點擊
    let hintEnabled = true;     // 威脅提示開關
    let playerColor = 1;        // 人機對戰下玩家的棋型顏色 (1: 黑, 2: 白)
    let nextGamePlayerColor = 1;// 下一局玩家的棋型顏色
    let rulesMode = 'standard'; // 'standard' (標準) 或 'renju' (禁手)
    let aiWorker = null;        // Web Worker 實例

    // 視角狀態變數
    let viewMode = '2d';        // '2d' (平面) 或 '3d' (立體)
    let isUndoing = false;      // 避免悔棋動畫播放期間重複操作

    // P2P 線上對戰狀態變數
    let peer = null;            // PeerJS 實例
    let p2pConn = null;         // Connection 實例
    let p2pMyColor = null;      // 線上對戰我方顏色 (1: 黑, 2: 白)

    // 對戰戰績統計
    let stats = {
        aiWins: 0,
        aiLosses: 0,
        pvpP1Wins: 0, // 黑棋勝
        pvpP2Wins: 0, // 白棋勝
        draws: 0
    };

    // ==========================================================================
    // DOM 元素選取器
    // ==========================================================================
    const boardEl = document.getElementById('gomoku-board');
    const statusTextEl = document.getElementById('status-text');
    const turnDotEl = document.querySelector('.turn-dot');
    const timerEl = document.getElementById('game-timer');
    
    const btnStart = document.getElementById('btn-start');
    const btnUndo = document.getElementById('btn-undo');
    const btnSound = document.getElementById('btn-sound');
    const soundIcon = document.getElementById('sound-icon');
    const btnClearStats = document.getElementById('btn-clear-stats');
    
    const modeButtons = document.querySelectorAll('#mode-select button');
    const difficultyButtons = document.querySelectorAll('#difficulty-select button');
    const difficultyGroup = document.getElementById('difficulty-group');
    const themeButtons = document.querySelectorAll('.theme-selector button');
    const hintButtons = document.querySelectorAll('#hint-select button');
    const rulesButtons = document.querySelectorAll('#rules-select button');
    const perspectiveButtons = document.querySelectorAll('#perspective-select button');
    
    // Win Modal
    const winModal = document.getElementById('win-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const btnModalRestart = document.getElementById('btn-modal-restart');
    const btnModalClose = document.getElementById('btn-modal-close');

    // P2P 連線選取器
    const p2pCard = document.getElementById('p2p-card');
    const p2pMyIdEl = document.getElementById('p2p-my-id');
    const p2pStatusEl = document.getElementById('p2p-status');
    const btnP2PInvite = document.getElementById('btn-p2p-invite');
    const p2pPeerIdInput = document.getElementById('p2p-peer-id-input');
    const btnP2PConnect = document.getElementById('btn-p2p-connect');

    // P2P 確認 Modal
    const p2pConfirmModal = document.getElementById('p2p-confirm-modal');
    const p2pConfirmTitle = document.getElementById('p2p-confirm-title');
    const p2pConfirmMessage = document.getElementById('p2p-confirm-message');
    let btnP2PConfirmYes = document.getElementById('btn-p2p-confirm-yes');
    let btnP2PConfirmNo = document.getElementById('btn-p2p-confirm-no');

    // ==========================================================================
    // 遊戲初始化
    // ==========================================================================
    function initGame() {
        createBoardGrid();
        loadStats();
        loadSettingsFromStorage();
        resetGame();
    }

    // 建立 15x15 棋盤格點 (實作細緻的十字格線與星位)
    function createBoardGrid() {
        boardEl.innerHTML = '';
        const starPoints = new Set([
            '3,3', '3,11', '7,7', '11,3', '11,11'
        ]);

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;

                // 標記邊緣以做格線優化 (使線條不超出棋盤邊框)
                if (r === 0) cell.classList.add('cell-top');
                if (r === BOARD_SIZE - 1) cell.classList.add('cell-bottom');
                if (c === 0) cell.classList.add('cell-left');
                if (c === BOARD_SIZE - 1) cell.classList.add('cell-right');

                // 傳統圍棋星位標記
                if (starPoints.has(`${r},${c}`)) {
                    cell.classList.add('star-point');
                    const dot = document.createElement('div');
                    dot.className = 'star-point-dot';
                    cell.appendChild(dot);
                }

                // 建立半透明懸停棋子預覽
                const hoverPreview = document.createElement('div');
                hoverPreview.className = 'hover-preview';
                cell.appendChild(hoverPreview);

                boardEl.appendChild(cell);
            }
        }
    }

    // 重設遊戲狀態與計時器
    function resetGame() {
        terminateAIWorker(); // 確保重設時終止背景 AI 運算
        // 初始化棋盤資料
        board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
        currentTurn = 1; // 黑棋先手
        isGameOver = false;
        isAiThinking = false;
        history = [];
        lastMove = null;

        // 如果是人機對戰，輪流執黑子/白子
        if (gameMode === 'ai') {
            playerColor = nextGamePlayerColor;
            nextGamePlayerColor = 3 - nextGamePlayerColor; // 輪替下一次顏色 (1->2, 2->1)
        } else if (gameMode === 'p2p') {
            playerColor = p2pMyColor || 1; // P2P 模式下綁定個人執子顏色
        } else {
            playerColor = 1; // 雙人模式下預設玩家 1 執黑子
        }

        // UI 復原
        const cells = boardEl.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.classList.remove('has-stone');
            const stone = cell.querySelector('.stone');
            if (stone) stone.remove();
        });

        // 關閉 Modal
        winModal.classList.remove('active');

        // 更新狀態與按鈕
        updateTurnUI();
        btnUndo.disabled = true;
        clearThreatHints();
        updateForbiddenMoves(); // 更新黑棋禁手狀態

        // 重新啟動計時
        startTimer();

        // 如果是線上對戰且是房主，將重設狀態同步給客方
        if (gameMode === 'p2p' && p2pMyColor === 1) {
            sendP2PMessage({
                type: 'init',
                rulesMode: rulesMode,
                board: board,
                currentTurn: currentTurn
            });
        }

        // 如果是人機對戰模式且 AI 執黑子（先手），觸發 AI 自動落子
        if (gameMode === 'ai' && playerColor === 2) {
            triggerAIMove();
        }
    }

    // ==========================================================================
    // 對戰控制與落子邏輯
    // ==========================================================================
    function handleCellClick(r, c) {
        if (isGameOver || isAiThinking || isUndoing) return;
        if (board[r][c] !== 0) return; // 該位置已有棋子

        // 人機對戰模式下，限制只能在玩家回合落子
        if (gameMode === 'ai' && currentTurn !== playerColor) return;

        // 線上對戰模式下，限制只能在自己回合落子，且必須已連線
        if (gameMode === 'p2p') {
            if (!p2pConn || !p2pConn.open) {
                showP2PToast('⚠️ 目前未與對手連線，無法落子', true);
                return;
            }
            if (currentTurn !== playerColor) {
                showP2PToast('⚠️ 請等待對手落子...', true);
                return;
            }
        }

        // 禁手規則限制：如果當前是黑棋 (1) 且點擊位置為禁手點，禁止落子
        if (rulesMode === 'renju' && currentTurn === 1) {
            const forbiddenType = window.GomokuAI.checkForbidden(board, r, c, 1);
            if (forbiddenType) {
                playWarningSound();
                showForbiddenToast(forbiddenType);
                return;
            }
        }

        // 如果是線上對戰，落子時發送給對手
        if (gameMode === 'p2p') {
            sendP2PMessage({ type: 'move', r: r, c: c });
        }

        makeMove(r, c);

        // 人機對戰且遊戲尚未結束，觸發 AI 落子
        if (gameMode === 'ai' && !isGameOver) {
            triggerAIMove();
        }
    }

    // 執行落子
    function makeMove(r, c) {
        // 儲存悔棋歷史 (深拷貝棋盤與當前狀態)
        history.push({
            board: board.map(row => [...row]),
            currentTurn: currentTurn,
            lastMove: lastMove ? { ...lastMove } : null
        });
        btnUndo.disabled = false;

        // 落子數據更新
        board[r][c] = currentTurn;
        lastMove = { r, c };

        // 渲染棋子到 DOM
        renderStone(r, c, currentTurn);

        // 播放落子音效
        playStoneSound();

        // 檢查勝負
        const winResult = checkWin(r, c);
        if (winResult) {
            handleGameEnd(winResult.winner, winResult.stones);
            return;
        }

        // 檢查平局 (棋盤填滿)
        if (isBoardFull()) {
            handleGameEnd(0, []);
            return;
        }

        // 切換回合
        currentTurn = 3 - currentTurn; // 1 -> 2, 2 -> 1
        updateTurnUI();
        updateThreatHints();
        updateForbiddenMoves();

        // 3D 視角下落子瞬間棋盤微震特效
        if (viewMode === '3d') {
            setTimeout(() => {
                const wrapper = boardEl.parentElement;
                wrapper.classList.add('impact-shake');
                // 震動動畫時長為 240ms，結束後移除類別以便下次再觸發
                setTimeout(() => {
                    wrapper.classList.remove('impact-shake');
                }, 240);
            }, 200); // 200ms 正好是落子從空中墜地砸上棋面的瞬間
        }
    }

    // 渲染棋子元件與落子特效
    function renderStone(r, c, color) {
        const cell = boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        cell.classList.add('has-stone');

        // 移除先前的最後落子高亮
        const prevLastMove = boardEl.querySelector('.stone.last-move');
        if (prevLastMove) {
            prevLastMove.classList.remove('last-move');
        }

        const stone = document.createElement('div');
        stone.className = `stone ${color === 1 ? 'black' : 'white'} last-move`;
        cell.appendChild(stone);

        // 觸發落子粒子擴散特效
        createPlacementParticles(cell, color);
    }

    // 檢查棋盤是否填滿
    function isBoardFull() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) return false;
            }
        }
        return true;
    }

    // 檢查放置指定顏色子在 (r, c) 是否會完成五連子
    function completesFive(r, c, color) {
        board[r][c] = color;
        const win = checkWin(r, c);
        board[r][c] = 0;
        return win !== null;
    }

    // 檢查放置指定顏色子在 (r, c) 是否會形成活四 (兩端均為空格的四連子)
    function createsLiveFour(r, c, color) {
        board[r][c] = color;
        let isLive4 = false;

        const dirs = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 斜下 \
            [1, -1]   // 斜上 /
        ];

        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];

            // 尋找包含 (r, c) 的連續子序列的起點
            let startR = r;
            let startC = c;
            while (startR - dr >= 0 && startR - dr < BOARD_SIZE && startC - dc >= 0 && startC - dc < BOARD_SIZE && board[startR - dr][startC - dc] === color) {
                startR -= dr;
                startC -= dc;
            }

            // 尋找包含 (r, c) 的連續子序列的終點
            let endR = r;
            let endC = c;
            while (endR + dr >= 0 && endR + dr < BOARD_SIZE && endC + dc >= 0 && endC + dc < BOARD_SIZE && board[endR + dr][endC + dc] === color) {
                endR += dr;
                endC += dc;
            }

            // 計算連續長度
            let count = 0;
            if (dr !== 0) {
                count = Math.abs(endR - startR) / dr + 1;
            } else {
                count = Math.abs(endC - startC) / dc + 1;
            }

            if (count === 4) {
                // 檢查兩端是否為空
                const beforeR = startR - dr;
                const beforeC = startC - dc;
                const afterR = endR + dr;
                const afterC = endC + dc;

                const beforeEmpty = beforeR >= 0 && beforeR < BOARD_SIZE && beforeC >= 0 && beforeC < BOARD_SIZE && board[beforeR][beforeC] === 0;
                const afterEmpty = afterR >= 0 && afterR < BOARD_SIZE && afterC >= 0 && afterC < BOARD_SIZE && board[afterR][afterC] === 0;

                if (beforeEmpty && afterEmpty) {
                    isLive4 = true;
                    break;
                }
            }
        }

        board[r][c] = 0; // 復原
        return isLive4;
    }

    // 清除棋盤上所有威脅提示
    function clearThreatHints() {
        const rings = boardEl.querySelectorAll('.threat-ring');
        rings.forEach(ring => ring.remove());
    }

    // 掃描並更新棋盤上的威脅提示 (「活三」或「死四」的危險/關鍵空格，細分黑白棋與致命/預警等級)
    function updateThreatHints() {
        clearThreatHints();
        if (!hintEnabled || isGameOver || board.length === 0) return;

        // 掃描所有空格
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) {
                    // 分別檢測黑棋(1)與白棋(2)的威脅類型
                    const completesFiveBlack = completesFive(r, c, 1);
                    const completesFiveWhite = completesFive(r, c, 2);
                    const createsLiveFourBlack = createsLiveFour(r, c, 1);
                    const createsLiveFourWhite = createsLiveFour(r, c, 2);

                    // 致命威脅：在此落子能直接五連 (不論黑白)
                    const isFatal = completesFiveBlack || completesFiveWhite;
                    // 預警威脅：在此落子能成活四 (不論黑白，且非直接五連)
                    const isWarning = !isFatal && (createsLiveFourBlack || createsLiveFourWhite);

                    if (isFatal || isWarning) {
                        const cell = boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                        if (cell && !cell.querySelector('.threat-ring')) {
                            const ring = document.createElement('div');
                            ring.className = 'threat-ring';

                            // 1. 設定威脅等級類別
                            if (isFatal) {
                                ring.classList.add('threat-fatal');
                            } else {
                                ring.classList.add('threat-warning');
                            }

                            // 2. 設定所屬棋子顏色類別 (可能同時為黑白雙方威脅)
                            if (completesFiveBlack || (isWarning && createsLiveFourBlack)) {
                                ring.classList.add('threat-black');
                            }
                            if (completesFiveWhite || (isWarning && createsLiveFourWhite)) {
                                ring.classList.add('threat-white');
                            }

                            cell.appendChild(ring);
                        }
                    }
                }
            }
        }
    }

    // ==========================================================================
    // AI 對戰核心串接 (包含背景多線程 Web Worker 支援)
    // ==========================================================================
    function terminateAIWorker() {
        if (aiWorker) {
            aiWorker.terminate();
            aiWorker = null;
        }
        isAiThinking = false;
    }

    function triggerAIMove() {
        terminateAIWorker();
        isAiThinking = true;
        updateTurnUI();

        try {
            // 建立背景 Worker，非同步運算 AI 走法
            aiWorker = new Worker('ai_worker.js?v=1.2.0');
            
            aiWorker.onmessage = function(e) {
                // 如果已經結束，或是已經非 AI 思考中（如點了重新開始/悔棋），忽略此訊息
                if (isGameOver || !isAiThinking) return;
                
                const { bestMove, error } = e.data;
                if (error) {
                    console.error("AI Worker Error:", error);
                }
                
                isAiThinking = false;
                
                if (bestMove) {
                    makeMove(bestMove.r, bestMove.c);
                } else {
                    updateTurnUI();
                }
            };

            aiWorker.postMessage({
                board: board,
                aiColor: 3 - playerColor,
                difficulty: aiDifficulty,
                rulesEnabled: rulesMode === 'renju'
            });
            
        } catch (e) {
            console.warn("Failed to create Web Worker (possibly running under file://). Falling back to main thread calculation.", e);
            
            // 降級方案：主執行緒計算
            setTimeout(() => {
                if (isGameOver) return;
                const bestMove = window.GomokuAI.getBestMove(board, 3 - playerColor, aiDifficulty, rulesMode === 'renju');
                isAiThinking = false;
                if (bestMove) {
                    makeMove(bestMove.r, bestMove.c);
                } else {
                    updateTurnUI();
                }
            }, 400);
        }
    }

    // 更新棋盤上黑棋的禁手點標記
    function updateForbiddenMoves() {
        // 先清除所有 cell 的 forbidden 樣式
        const cells = boardEl.querySelectorAll('.cell');
        if (cells) {
            cells.forEach(cell => cell.classList.remove('forbidden'));
        }

        // 只有在棋盤已初始化、禁手規則開啟、遊戲未結束且當前輪到黑棋 (1) 的時候，才計算禁手點
        if (board.length === 0 || rulesMode !== 'renju' || isGameOver || currentTurn !== 1) {
            return;
        }

        // 掃描棋盤所有空格
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) {
                    const isForbidden = window.GomokuAI.checkForbidden(board, r, c, 1);
                    if (isForbidden) {
                        const cell = boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                        if (cell) {
                            cell.classList.add('forbidden');
                        }
                    }
                }
            }
        }
    }

    // 顯示禁手提示訊息
    function showForbiddenToast(type) {
        let text = '此處為黑棋禁手點！';
        if (type === 'double_three') text = '🚫 禁手：三三禁手！';
        else if (type === 'double_four') text = '🚫 禁手：四四禁手！';
        else if (type === 'overline') text = '🚫 禁手：長連禁手！';
        
        // 暫時將狀態文字改為禁手警告，1.5 秒後恢復
        statusTextEl.innerText = text;
        statusTextEl.style.color = '#ef4444';
        
        if (window.toastTimeout) {
            clearTimeout(window.toastTimeout);
        }
        
        window.toastTimeout = setTimeout(() => {
            statusTextEl.style.color = '';
            updateTurnUI();
        }, 1500);
    }

    // ==========================================================================
    // 勝負判定邏輯
    // ==========================================================================
    function checkWin(r, c) {
        const color = board[r][c];
        if (color === 0) return null;

        const dirs = [
            { dr: 0, dc: 1 },   // 水平
            { dr: 1, dc: 0 },   // 垂直
            { dr: 1, dc: 1 },   // 斜下 (左上到右下)
            { dr: 1, dc: -1 }   // 斜上 (左下到右上)
        ];

        for (let d = 0; d < dirs.length; d++) {
            const { dr, dc } = dirs[d];
            const winningStones = [{ r, c }];

            // 正向搜尋
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
                winningStones.push({ r: nr, c: nc });
                nr += dr;
                nc += dc;
            }

            // 反向搜尋
            nr = r - dr;
            nc = c - dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
                winningStones.push({ r: nr, c: nc });
                nr -= dr;
                nc -= dc;
            }

            // 五子連珠判定獲勝
            if (winningStones.length >= 5) {
                return {
                    winner: color,
                    stones: winningStones
                };
            }
        }
        return null;
    }

    // 處理遊戲結束
    function handleGameEnd(winner, winningStones) {
        isGameOver = true;
        stopTimer();
        btnUndo.disabled = true;

        let titleText = '';
        let msgText = '';

        if (winner === 0) {
            // 平局
            titleText = '平局！';
            msgText = '棋盤已滿，雙方勢均力敵！';
            stats.draws++;
        } else {
            // 高亮所有獲勝的五顆棋子
            winningStones.forEach(pos => {
                const cell = boardEl.querySelector(`[data-row="${pos.r}"][data-col="${pos.c}"]`);
                const stone = cell.querySelector('.stone');
                if (stone) {
                    stone.classList.add('winning-stone');
                }
            });

            // 播放勝利音效
            playWinSound();

            if (gameMode === 'ai') {
                if (winner === playerColor) {
                    titleText = '🎉 恭喜獲勝！';
                    msgText = `您成功擊敗了 [${getDiffName(aiDifficulty)}] AI！`;
                    stats.aiLosses++; // 玩家獲勝，代表 AI 輸了
                } else {
                    titleText = '💻 AI 獲勝！';
                    msgText = `很遺憾，[${getDiffName(aiDifficulty)}] AI 贏得了本局。再接再厲！`;
                    stats.aiWins++;
                }
            } else if (gameMode === 'p2p') {
                const isMe = (winner === playerColor);
                const colorName = winner === 1 ? '黑棋' : '白棋';
                if (isMe) {
                    titleText = '🎉 恭喜獲勝！';
                    msgText = `您執 ${colorName} 連成五子，贏得線上對決！`;
                } else {
                    titleText = '💀 棋差一招！';
                    msgText = `對手執 ${colorName} 連成五子，贏得線上對決。再接再厲！`;
                }
                
                if (winner === 1) stats.pvpP1Wins++;
                else stats.pvpP2Wins++;
            } else {
                const winnerName = winner === 1 ? '黑棋 (玩家1)' : '白棋 (玩家2)';
                titleText = `${winnerName} 獲勝！`;
                msgText = '五子連珠，贏得本局勝利！';
                
                if (winner === 1) stats.pvpP1Wins++;
                else stats.pvpP2Wins++;
            }
        }

        // 儲存戰績
        saveStats();

        // 延遲彈出勝利視窗，讓玩家先看到五子相連特效
        setTimeout(() => {
            modalTitle.innerText = titleText;
            modalMessage.innerText = msgText;
            winModal.classList.add('active');
        }, 800);
    }

    function getDiffName(diff) {
        if (diff === 'easy') return '簡單';
        if (diff === 'medium') return '中等';
        return '困難';
    }

    // ==========================================================================
    // 悔棋與歷史管理
    // ==========================================================================
    function executeUndo(stepsToUndo) {
        if (history.length === 0 || isGameOver || isAiThinking || isUndoing) return;

        // 1. 取得目標回退狀態（但不先套用）
        let tempHistory = [...history];
        let targetState = null;
        for (let i = 0; i < stepsToUndo; i++) {
            if (tempHistory.length > 0) {
                targetState = tempHistory.pop();
            }
        }
        if (!targetState) return;

        // 2. 鎖定棋盤，播放悔棋音效
        isUndoing = true;
        playUndoSound();

        // 3. 對比當前棋盤與目標棋盤，找出需要移除的棋子
        const targetBoard = targetState.board;
        const stonesToRemove = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                // 當前有棋子，但目標棋盤為空，說明這顆棋子要被移除
                if (board[r][c] !== 0 && targetBoard[r][c] === 0) {
                    stonesToRemove.push({ r, c });
                }
            }
        }

        // 4. 找到對應的 DOM 元素，加上 stone-undoing class 觸發飛起動畫
        stonesToRemove.forEach(({ r, c }) => {
            const cell = boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cell) {
                const stone = cell.querySelector('.stone');
                if (stone) {
                    stone.classList.add('stone-undoing');
                }
            }
        });

        // 5. 延遲 350ms 待飛起動畫播完後，正式套用回退狀態並重繪
        setTimeout(() => {
            // 從 history 中真正 pop 出來
            for (let i = 0; i < stepsToUndo; i++) {
                if (history.length > 0) {
                    history.pop();
                }
            }

            board = targetState.board;
            currentTurn = targetState.currentTurn;
            lastMove = targetState.lastMove;

            // 重新繪製棋子
            const cells = boardEl.querySelectorAll('.cell');
            cells.forEach(cell => {
                const r = parseInt(cell.dataset.row);
                const c = parseInt(cell.dataset.col);
                const color = board[r][c];

                cell.classList.remove('has-stone');
                const stone = cell.querySelector('.stone');
                if (stone) stone.remove();

                if (color !== 0) {
                    cell.classList.add('has-stone');
                    const newStone = document.createElement('div');
                    newStone.className = `stone ${color === 1 ? 'black' : 'white'}`;
                    
                    // 重新標記最後落子
                    if (lastMove && lastMove.r === r && lastMove.c === c) {
                        newStone.classList.add('last-move');
                      }
                    cell.appendChild(newStone);
                }
            });

            updateTurnUI();
            updateThreatHints();
            updateForbiddenMoves(); // 悔棋後重算黑棋禁手狀態

            if (history.length === 0) {
                btnUndo.disabled = true;
            }

            isUndoing = false; // 解除鎖定
        }, 350);
    }

    function undoMove() {
        const steps = (gameMode === 'ai' && history.length >= 2) ? 2 : 1;
        executeUndo(steps);
    }

    // ==========================================================================
    // UI 輔助更新與定時器
    // ==========================================================================
    function updateTurnUI() {
        // 清除暫時的禁手警告紅色樣式
        statusTextEl.style.color = '';

        // 更新懸停預覽棋子顏色
        const hoverPreviews = boardEl.querySelectorAll('.hover-preview');
        hoverPreviews.forEach(preview => {
            preview.className = `hover-preview ${currentTurn === 1 ? 'black' : 'white'}`;
        });

        // 棋盤的 class 輔助樣式，表示當前回合
        boardEl.className = `gomoku-board turn-${currentTurn === 1 ? 'black' : 'white'}`;

        // 更新狀態列
        turnDotEl.className = 'turn-dot';
        turnDotEl.classList.add(currentTurn === 1 ? 'current-black' : 'current-white');

        if (isGameOver) {
            statusTextEl.innerText = '遊戲結束';
            turnDotEl.classList.remove('thinking');
            return;
        }

        if (gameMode === 'ai') {
            if (currentTurn === playerColor) {
                statusTextEl.innerText = `玩家回合 (${playerColor === 1 ? '黑棋' : '白棋'})`;
                turnDotEl.classList.remove('thinking');
            } else {
                statusTextEl.innerText = 'AI 思考中...';
                turnDotEl.classList.add('thinking');
            }
        } else {
            statusTextEl.innerText = `${currentTurn === 1 ? '黑棋' : '白棋'}回合`;
            turnDotEl.classList.remove('thinking');
        }
    }

    function startTimer() {
        stopTimer();
        gameSeconds = 0;
        updateTimerDisplay();
        timerInterval = setInterval(() => {
            gameSeconds++;
            updateTimerDisplay();
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimerDisplay() {
        const mins = Math.floor(gameSeconds / 60).toString().padStart(2, '0');
        const secs = (gameSeconds % 60).toString().padStart(2, '0');
        timerEl.innerText = `${mins}:${secs}`;
    }

    // ==========================================================================
    // 網頁音效合成系統 (基於 Web Audio API)
    // ==========================================================================
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // 合成真實的落子聲 (高頻敲擊點 + 木質棋盤共振)
    function playStoneSound() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;

            // 1. 落子敲擊聲 (高頻瞬態 click)
            const clickOsc = audioCtx.createOscillator();
            const clickGain = audioCtx.createGain();
            clickOsc.type = 'triangle';
            clickOsc.frequency.setValueAtTime(1400, now);
            clickOsc.frequency.exponentialRampToValueAtTime(350, now + 0.012);

            clickGain.gain.setValueAtTime(0.12, now);
            clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

            clickOsc.connect(clickGain);
            clickGain.connect(audioCtx.destination);

            // 2. 木盤沉悶共振 (低頻 resonance)
            const boardOsc = audioCtx.createOscillator();
            const boardGain = audioCtx.createGain();
            boardOsc.type = 'sine';
            boardOsc.frequency.setValueAtTime(300, now);
            boardOsc.frequency.exponentialRampToValueAtTime(100, now + 0.07);

            // 使用帶通濾波器使聲音更具木頭感
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(220, now);
            filter.Q.setValueAtTime(1.8, now);

            boardGain.gain.setValueAtTime(0.35, now);
            boardGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            boardOsc.connect(filter);
            filter.connect(boardGain);
            boardGain.connect(audioCtx.destination);

            clickOsc.start(now);
            clickOsc.stop(now + 0.02);

            boardOsc.start(now);
            boardOsc.stop(now + 0.09);
        } catch (e) {
            console.warn("Failed to synthesize move sound", e);
        }
    }

    // 合成勝利的五聲大調琶音
    function playWinSound() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            // C 大調五聲音階 (C4, D4, E4, G4, A4, C5)
            const freqs = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
            
            freqs.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                
                // 漸強後漸弱
                gain.gain.setValueAtTime(0, now + idx * 0.07);
                gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.07 + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.45);
                
                // 簡單低通濾波，溫和舒適
                const lp = audioCtx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(1200, now);
                
                osc.connect(lp);
                lp.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.start(now + idx * 0.07);
                osc.stop(now + idx * 0.07 + 0.5);
            });
        } catch (e) {
            console.warn("Failed to play win sound", e);
        }
    }

    // 悔棋的滑降音效
    function playUndoSound() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.linearRampToValueAtTime(160, now + 0.12);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.15);
        } catch (e) {
            console.warn("Failed to play undo sound", e);
        }
    }

    // 合成禁手警告音效 (雙聲低頻 buzz)
    function playWarningSound() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.15);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(300, now);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.16);
        } catch (e) {
            console.warn("Failed to play warning sound", e);
        }
    }

    // ==========================================================================
    // 視覺動態效果 (落子粒子爆破)
    // ==========================================================================
    function createPlacementParticles(cellEl, color) {
        const rect = cellEl.getBoundingClientRect();
        const boardRect = boardEl.getBoundingClientRect();
        
        // 算出該格子中心相對於棋盤容器的座標
        const centerX = rect.left - boardRect.left + rect.width / 2;
        const centerY = rect.top - boardRect.top + rect.height / 2;

        const isThemeNeon = document.body.classList.contains('theme-neon');
        const particleColor = color === 1 
            ? (isThemeNeon ? '#00f2fe' : '#1e293b') 
            : (isThemeNeon ? '#f472b6' : '#ffffff');

        const particleCount = 10;

        for (let i = 0; i < particleCount; i++) {
            const p = document.createElement('div');
            p.className = 'particle';

            // 放射狀隨機軌跡與距離
            const angle = Math.random() * Math.PI * 2;
            const distance = 25 + Math.random() * 35;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;

            p.style.setProperty('--tx', `${tx}px`);
            p.style.setProperty('--ty', `${ty}px`);
            
            const size = 3 + Math.random() * 5;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.background = particleColor;
            
            p.style.left = `${centerX}px`;
            p.style.top = `${centerY}px`;

            if (isThemeNeon) {
                p.style.boxShadow = `0 0 6px ${particleColor}`;
            }

            boardEl.appendChild(p);

            // 動畫結束後移除 DOM 避免溢出
            setTimeout(() => {
                p.remove();
            }, 600);
        }
    }

    // ==========================================================================
    // 本地戰績數據庫 (localStorage)
    // ==========================================================================
    function loadStats() {
        const savedStats = localStorage.getItem('cyber_gomoku_stats');
        if (savedStats) {
            try {
                stats = JSON.parse(savedStats);
            } catch (e) {
                console.error("Parse error on stats", e);
            }
        }
        updateStatsUI();
    }

    function saveStats() {
        localStorage.setItem('cyber_gomoku_stats', JSON.stringify(stats));
        updateStatsUI();
    }

    function updateStatsUI() {
        if (gameMode === 'ai') {
            document.getElementById('player1-label').innerText = '玩家勝';
            document.getElementById('player2-label').innerText = 'AI勝';
            document.getElementById('stat-p1-wins').innerText = stats.aiLosses; // 玩家獲勝次數 = AI 戰敗次數
            document.getElementById('stat-p2-wins').innerText = stats.aiWins;
        } else {
            document.getElementById('player1-label').innerText = '黑棋勝';
            document.getElementById('player2-label').innerText = '白棋勝';
            document.getElementById('stat-p1-wins').innerText = stats.pvpP1Wins;
            document.getElementById('stat-p2-wins').innerText = stats.pvpP2Wins;
        }
        document.getElementById('stat-draws').innerText = stats.draws;
    }

    function clearStats() {
        stats = { aiWins: 0, aiLosses: 0, pvpP1Wins: 0, pvpP2Wins: 0, draws: 0 };
        saveStats();
    }

    // ==========================================================================
    // 設定儲存讀取 (localStorage)
    // ==========================================================================
    function loadSettingsFromStorage() {
        const theme = localStorage.getItem('cyber_gomoku_theme') || 'neon';
        setTheme(theme);

        const savedMode = localStorage.getItem('cyber_gomoku_mode') || 'ai';
        setGameMode(savedMode);

        const savedDiff = localStorage.getItem('cyber_gomoku_diff') || 'medium';
        setAIDifficulty(savedDiff);

        const savedSound = localStorage.getItem('cyber_gomoku_sound');
        if (savedSound !== null) {
            soundEnabled = savedSound === 'true';
            updateSoundButtonUI();
        }

        const savedHint = localStorage.getItem('cyber_gomoku_hint');
        if (savedHint !== null) {
            setHintEnabled(savedHint === 'true');
        } else {
            setHintEnabled(true);
        }

        const savedRules = localStorage.getItem('cyber_gomoku_rules') || 'standard';
        setRulesMode(savedRules);

        const savedView = localStorage.getItem('cyber_gomoku_view') || '2d';
        setPerspectiveView(savedView);
    }

    function setTheme(theme) {
        document.body.className = `theme-${theme}`;
        themeButtons.forEach(btn => {
            if (btn.dataset.theme === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('cyber_gomoku_theme', theme);
    }

    function setGameMode(mode) {
        gameMode = mode;
        modeButtons.forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 依對戰模式顯示/隱藏 AI 難度設定與 P2P 連線卡片
        if (mode === 'ai') {
            difficultyGroup.style.display = 'block';
            p2pCard.style.display = 'none';
        } else if (mode === 'p2p') {
            difficultyGroup.style.display = 'none';
            p2pCard.style.display = 'block';
            initP2P(); // 初始化 P2P 線上連線
        } else {
            difficultyGroup.style.display = 'none';
            p2pCard.style.display = 'none';
        }

        updateStatsUI();
        localStorage.setItem('cyber_gomoku_mode', mode);
    }

    function setAIDifficulty(diff) {
        aiDifficulty = diff;
        difficultyButtons.forEach(btn => {
            if (btn.dataset.diff === diff) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('cyber_gomoku_diff', diff);
    }

    function setHintEnabled(enabled) {
        hintEnabled = enabled;
        hintButtons.forEach(btn => {
            const val = btn.dataset.hint === 'on';
            if (val === enabled) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('cyber_gomoku_hint', enabled);
        updateThreatHints();
     }

    function setRulesMode(mode) {
        if (gameMode === 'p2p') {
            if (p2pMyColor === 2) {
                showP2PToast('🚫 只有房主可以更改規則設定', true);
                setRulesModeUI(rulesMode); // 還原 UI 的 active 狀態
                return;
            }
            // 房主修改規則，發送同步設定給客方
            rulesMode = mode;
            setRulesModeUI(mode);
            sendP2PMessage({ type: 'sync-settings', rulesMode: mode });
            updateForbiddenMoves();
            return;
        }

        rulesMode = mode;
        rulesButtons.forEach(btn => {
            if (btn.dataset.rules === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('cyber_gomoku_rules', mode);
        updateForbiddenMoves();
    }

    function setPerspectiveView(view) {
        viewMode = view;
        perspectiveButtons.forEach(btn => {
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const boardWrapper = document.querySelector('.board-wrapper');
        if (boardWrapper) {
            if (view === '3d') {
                boardWrapper.classList.add('view-3d');
            } else {
                boardWrapper.classList.remove('view-3d');
            }
        }
        localStorage.setItem('cyber_gomoku_view', view);
    }

    function updateSoundButtonUI() {
        if (soundEnabled) {
            soundIcon.innerText = '🔊';
            btnSound.innerHTML = '<span class="btn-icon" id="sound-icon">🔊</span> 音效: 開';
        } else {
            soundIcon.innerText = '🔇';
            btnSound.innerHTML = '<span class="btn-icon" id="sound-icon">🔇</span> 音效: 關';
        }
    }

    // ==========================================================================
    // 線上對戰 (P2P Multiplayer) 控制邏輯
    // ==========================================================================
    function setP2PStatus(status, color = '') {
        if (!p2pStatusEl) return;
        p2pStatusEl.innerText = status;
        p2pStatusEl.style.color = color;
    }

    function showP2PToast(message, isAlert = false) {
        statusTextEl.innerText = message;
        statusTextEl.style.color = isAlert ? '#ef4444' : 'var(--accent-secondary)';
        
        if (window.p2pToastTimeout) {
            clearTimeout(window.p2pToastTimeout);
        }
        
        window.p2pToastTimeout = setTimeout(() => {
            statusTextEl.style.color = '';
            updateTurnUI();
        }, 3000);
    }

    function initP2P() {
        if (typeof Peer === 'undefined') {
            setP2PStatus('❌ 無法載入 P2P 模組', '#ef4444');
            showP2PToast('⚠️ P2P 庫載入失敗，無法使用連線對戰', true);
            return;
        }

        if (peer && !peer.destroyed) {
            if (p2pConn && p2pConn.open) {
                setP2PStatus(`已連線 (對手: ${p2pConn.peer})`, 'var(--accent-secondary)');
            } else {
                setP2PStatus('等待對手連線...', 'var(--accent-primary)');
            }
            return;
        }

        setP2PStatus('連線信令伺服器中...');
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
            p2pMyIdEl.innerText = id;
            setP2PStatus('等待對手連線...', 'var(--accent-primary)');

            // 解析 URL 參數自動連線
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('room');
            if (roomId && roomId !== id) {
                // 清除 URL 的 room 參數，以防重新整理時重複連線
                window.history.replaceState({}, document.title, window.location.pathname);
                connectToPeer(roomId);
            }
        });

        // 房主接收連線
        peer.on('connection', (conn) => {
            if (p2pConn && p2pConn.open) {
                conn.close();
                return;
            }

            p2pConn = conn;
            p2pMyColor = 1; // 房主為先手黑棋

            setupP2PConnection(conn);
        });

        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                setP2PStatus('❌ 找不到該連線 ID', '#ef4444');
                showP2PToast('⚠️ 找不到該連線 ID，請確認是否輸入正確', true);
            } else {
                setP2PStatus(`❌ 連線出錯: ${err.type}`, '#ef4444');
            }
        });
    }

    function connectToPeer(targetId) {
        if (!peer || peer.destroyed) {
            showP2PToast('⚠️ P2P 尚未初始化完成，請稍後...', true);
            return;
        }
        
        setP2PStatus('連線對手中...', 'var(--text-secondary)');
        p2pMyColor = 2; // 客方為白棋後手
        
        const conn = peer.connect(targetId);
        p2pConn = conn;
        
        setupP2PConnection(conn);
    }

    function setupP2PConnection(conn) {
        const onConnOpen = () => {
            setP2PStatus(`已連線 (對手: ${conn.peer})`, 'var(--accent-secondary)');
            
            // 房主連線成功後，初始化遊戲設定並同步給客方
            if (p2pMyColor === 1) {
                resetGame();
                sendP2PMessage({
                    type: 'init',
                    rulesMode: rulesMode,
                    board: board,
                    currentTurn: currentTurn
                });
                showP2PToast('連線成功！由您 (黑棋) 先手落子');
            } else {
                showP2PToast('連線成功！等待房主 (黑棋) 開始並落子');
            }
        };

        if (conn.open) {
            onConnOpen();
        } else {
            conn.on('open', onConnOpen);
        }

        conn.on('data', (data) => {
            handleP2PData(data);
        });

        conn.on('close', () => {
            handleP2PClose();
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            handleP2PClose();
        });
    }

    function sendP2PMessage(msg) {
        if (p2pConn && p2pConn.open) {
            p2pConn.send(msg);
        }
    }

    function handleP2PData(data) {
        switch (data.type) {
            case 'init':
                // 客方同步房主的初始設定
                rulesMode = data.rulesMode;
                setRulesModeUI(rulesMode);
                board = data.board;
                currentTurn = data.currentTurn;
                lastMove = null;
                history = [];
                isGameOver = false;
                
                // 重新渲染棋盤
                syncGameBoardUI();
                updateTurnUI();
                updateThreatHints();
                updateForbiddenMoves();
                startTimer();
                break;

            case 'move':
                // 收到對手的落子
                if (currentTurn !== p2pMyColor) {
                    makeMove(data.r, data.c);
                }
                break;

            case 'undo-request':
                // 對手請求悔棋
                showP2PConfirmModal(
                    '悔棋請求',
                    '對手請求悔棋，請問是否同意？',
                    () => {
                        sendP2PMessage({ type: 'undo-response', accept: true });
                        const undoSteps = history.length >= 2 ? 2 : 1;
                        executeUndo(undoSteps);
                        showP2PToast('您同意了對手的悔棋請求');
                    },
                    () => {
                        sendP2PMessage({ type: 'undo-response', accept: false });
                        showP2PToast('您拒絕了對手的悔棋請求');
                    }
                );
                break;

            case 'undo-response':
                if (data.accept) {
                    const undoSteps = history.length >= 2 ? 2 : 1;
                    executeUndo(undoSteps);
                    showP2PToast('對手同意了您的悔棋請求');
                } else {
                    showP2PToast('❌ 對手拒絕了您的悔棋請求', true);
                }
                break;

            case 'restart-request':
                // 對手請求重新開始對局
                showP2PConfirmModal(
                    '對戰請求',
                    '對手請求重新開始對局，請問是否同意？',
                    () => {
                        sendP2PMessage({ type: 'restart-response', accept: true });
                        resetGame();
                        showP2PToast('重新對局開始！');
                    },
                    () => {
                        sendP2PMessage({ type: 'restart-response', accept: false });
                        showP2PToast('您拒絕了重新對局的請求');
                    }
                );
                break;

            case 'restart-response':
                if (data.accept) {
                    resetGame();
                    showP2PToast('對手同意重新開始，對局已重置');
                } else {
                    showP2PToast('❌ 對手拒絕了重新開始對局的請求', true);
                }
                break;

            case 'sync-settings':
                // 同步房主的規則設定
                rulesMode = data.rulesMode;
                setRulesModeUI(rulesMode);
                updateForbiddenMoves();
                showP2PToast(`房主已將規則變更為：${rulesMode === 'renju' ? '禁手規則' : '標準規則'}`);
                break;
        }
    }

    function handleP2PClose() {
        p2pConn = null;
        setP2PStatus('等待對手連線...', 'var(--accent-primary)');
        showP2PToast('⚠️ 對手已斷開連線，對局終止', true);
        isGameOver = true;
        stopTimer();
    }

    function syncGameBoardUI() {
        const cells = boardEl.querySelectorAll('.cell');
        cells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            const color = board[r][c];

            cell.classList.remove('has-stone');
            const stone = cell.querySelector('.stone');
            if (stone) stone.remove();

            if (color !== 0) {
                cell.classList.add('has-stone');
                const newStone = document.createElement('div');
                newStone.className = `stone ${color === 1 ? 'black' : 'white'}`;
                cell.appendChild(newStone);
            }
        });
    }

    function setRulesModeUI(mode) {
        rulesButtons.forEach(btn => {
            if (btn.dataset.rules === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function showP2PConfirmModal(title, message, onYes, onNo) {
        p2pConfirmTitle.innerText = title;
        p2pConfirmMessage.innerText = message;
        
        p2pConfirmModal.classList.add('active');
        
        // 複製按鈕以清除舊監聽
        const newYes = btnP2PConfirmYes.cloneNode(true);
        const newNo = btnP2PConfirmNo.cloneNode(true);
        
        btnP2PConfirmYes.parentNode.replaceChild(newYes, btnP2PConfirmYes);
        btnP2PConfirmNo.parentNode.replaceChild(newNo, btnP2PConfirmNo);
        
        btnP2PConfirmYes = newYes;
        btnP2PConfirmNo = newNo;
        
        btnP2PConfirmYes.addEventListener('click', () => {
            p2pConfirmModal.classList.remove('active');
            onYes();
        });
        
        btnP2PConfirmNo.addEventListener('click', () => {
            p2pConfirmModal.classList.remove('active');
            onNo();
        });
    }

    // ==========================================================================
    // 事件監聽
    // ==========================================================================
    btnStart.addEventListener('click', () => {
        initAudio(); // 確保使用者互動觸發 AudioContext
        if (gameMode === 'p2p') {
            if (p2pConn && p2pConn.open) {
                sendP2PMessage({ type: 'restart-request' });
                showP2PToast('已發送重新對局請求，等待對手同意...');
            } else {
                resetGame();
            }
        } else {
            resetGame();
        }
    });

    btnUndo.addEventListener('click', () => {
        initAudio();
        if (gameMode === 'p2p') {
            if (p2pConn && p2pConn.open) {
                sendP2PMessage({ type: 'undo-request' });
                showP2PToast('已發送悔棋請求，等待對手同意...');
            } else {
                undoMove();
            }
        } else {
            undoMove();
        }
    });

    btnSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        updateSoundButtonUI();
        localStorage.setItem('cyber_gomoku_sound', soundEnabled);
        initAudio();
    });

    btnClearStats.addEventListener('click', () => {
        if (confirm('確定要清除所有對戰數據嗎？此動作無法復原。')) {
            clearStats();
        }
    });

    // 模式切換
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            initAudio();
            const selectedMode = btn.dataset.mode;
            if (selectedMode !== gameMode) {
                setGameMode(selectedMode);
                if (selectedMode !== 'p2p') {
                    resetGame();
                }
            }
        });
    });

    // 難度切換
    difficultyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            initAudio();
            const selectedDiff = btn.dataset.diff;
            if (selectedDiff !== aiDifficulty) {
                setAIDifficulty(selectedDiff);
                resetGame();
            }
        });
    });

    // 主題切換
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            initAudio();
            const selectedTheme = btn.dataset.theme;
            setTheme(selectedTheme);
        });
    });

    // 視角切換
    perspectiveButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            initAudio();
            const selectedView = btn.dataset.view;
            if (selectedView !== viewMode) {
                setPerspectiveView(selectedView);
            }
        });
    });

    // 提示切換
    hintButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            initAudio();
            const selectedHint = btn.dataset.hint === 'on';
            if (selectedHint !== hintEnabled) {
                setHintEnabled(selectedHint);
            }
        });
    });

    // 規則切換
    rulesButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            initAudio();
            const selectedRules = btn.dataset.rules;
            if (selectedRules !== rulesMode) {
                setRulesMode(selectedRules);
                resetGame(); // 規則切換後重新開局，確保公平
            }
        });
    });

    // Modal 重玩與關閉
    btnModalRestart.addEventListener('click', () => {
        resetGame();
    });

    btnModalClose.addEventListener('click', () => {
        winModal.classList.remove('active');
    });

    // About Modal 顯示與關閉
    const btnAbout = document.getElementById('btn-about');
    const aboutModal = document.getElementById('about-modal');
    const btnAboutClose = document.getElementById('btn-about-close');

    btnAbout.addEventListener('click', () => {
        initAudio();
        aboutModal.classList.add('active');
    });

    btnAboutClose.addEventListener('click', () => {
        aboutModal.classList.remove('active');
    });

    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            aboutModal.classList.remove('active');
        }
    });

    // P2P 邀請連結複製
    btnP2PInvite.addEventListener('click', () => {
        initAudio();
        if (!peer || !peer.id) {
            showP2PToast('⚠️ 正在取得連線 ID，請稍後...', true);
            return;
        }
        
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${peer.id}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
            btnP2PInvite.innerText = '✅ 已複製連結！';
            setTimeout(() => {
                btnP2PInvite.innerText = '🔗 複製邀請連結';
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            showP2PToast('⚠️ 複製連結失敗，請手動複製 ID', true);
        });
    });

    // P2P 手動連線
    btnP2PConnect.addEventListener('click', () => {
        initAudio();
        const targetId = p2pPeerIdInput.value.trim();
        if (!targetId) {
            showP2PToast('⚠️ 請輸入好友的連線 ID', true);
            return;
        }
        if (peer && targetId === peer.id) {
            showP2PToast('⚠️ 不能與自己進行連線對戰', true);
            return;
        }
        connectToPeer(targetId);
    });

    // 棋盤點擊事件委派與 Proximity 命中補償機制
    boardEl.parentElement.addEventListener('click', (e) => {
        // 優先透過 DOM 樹尋找最近的 cell 元素
        const cell = e.target.closest('.cell');
        if (cell) {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            handleCellClick(r, c);
            return;
        }

        // Proximity 補償：如果點擊落在格線縫隙、棋盤邊界或外層 wrapper 上
        // 我們計算點擊 client 坐標與所有格子中心的距離，找出最近的格子落子
        let minDistance = Infinity;
        let closestCell = null;
        const cells = boardEl.querySelectorAll('.cell');
        
        cells.forEach(c => {
            const rect = c.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
            if (dist < minDistance) {
                minDistance = dist;
                closestCell = c;
            }
        });

        // 只要最近距離在 cell 寬度的 1.5 倍半徑內，就判定為點擊該 cell
        if (closestCell && minDistance < closestCell.offsetWidth * 1.5) {
            const r = parseInt(closestCell.dataset.row);
            const c = parseInt(closestCell.dataset.col);
            handleCellClick(r, c);
        }
    });

    // 3D 滑鼠隨動動態反射光影
    const boardWrapperEl = boardEl.parentElement;
    boardWrapperEl.addEventListener('mousemove', (e) => {
        if (viewMode !== '3d') return; // 僅在 3D 視角下啟用動態光影以節省計算效能
        
        const rect = boardWrapperEl.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        // 歸一化坐標 (-1.0 到 1.0)
        const pctX = x / (rect.width / 2);
        const pctY = y / (rect.height / 2);
        
        boardWrapperEl.style.setProperty('--light-x', pctX.toFixed(3));
        boardWrapperEl.style.setProperty('--light-y', pctY.toFixed(3));
    });

    boardWrapperEl.addEventListener('mouseleave', () => {
        if (viewMode !== '3d') return;
        // 滑鼠離開後平滑重設為中心
        boardWrapperEl.style.setProperty('--light-x', '0');
        boardWrapperEl.style.setProperty('--light-y', '0');
    });

    // 啟動初始化
    initGame();

    // 啟動後檢查是否有 URL 邀請房間參數，有的話自動轉為 P2P 模式
    const checkUrlRoom = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            // 切換為 P2P 模式，會自動觸發 initP2P() 進行連線
            setGameMode('p2p');
        }
    };
    checkUrlRoom();
});
