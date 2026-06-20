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
    
    // Win Modal
    const winModal = document.getElementById('win-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const btnModalRestart = document.getElementById('btn-modal-restart');
    const btnModalClose = document.getElementById('btn-modal-close');

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

                // 落子點擊事件
                cell.addEventListener('click', () => handleCellClick(r, c));

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

        // 如果是人機對戰模式且 AI 執黑子（先手），觸發 AI 自動落子
        if (gameMode === 'ai' && playerColor === 2) {
            triggerAIMove();
        }
    }

    // ==========================================================================
    // 對戰控制與落子邏輯
    // ==========================================================================
    function handleCellClick(r, c) {
        if (isGameOver || isAiThinking) return;
        if (board[r][c] !== 0) return; // 該位置已有棋子

        // 人機對戰模式下，限制只能在玩家回合落子
        if (gameMode === 'ai' && currentTurn !== playerColor) return;

        // 禁手規則限制：如果當前是黑棋 (1) 且點擊位置為禁手點，禁止落子
        if (rulesMode === 'renju' && currentTurn === 1) {
            const forbiddenType = window.GomokuAI.checkForbidden(board, r, c, 1);
            if (forbiddenType) {
                playWarningSound();
                showForbiddenToast(forbiddenType);
                return;
            }
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

    // 掃描並更新棋盤上的威脅提示 (「活三」或「死四」的危險/關鍵空格)
    function updateThreatHints() {
        clearThreatHints();
        if (!hintEnabled || isGameOver || board.length === 0) return;

        // 掃描所有空格
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) {
                    // 如果在此落子對黑棋 (1) 或白棋 (2) 能形成五連子 (死四防守/進攻點)
                    // 或者能形成活四 (活三防守/進攻點)
                    const isThreat = completesFive(r, c, 1) || completesFive(r, c, 2) ||
                                     createsLiveFour(r, c, 1) || createsLiveFour(r, c, 2);

                    if (isThreat) {
                        const cell = boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                        if (cell && !cell.querySelector('.threat-ring')) {
                            const ring = document.createElement('div');
                            ring.className = 'threat-ring';
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
            aiWorker = new Worker('ai_worker.js');
            
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
        cells.forEach(cell => cell.classList.remove('forbidden'));

        // 只有在禁手規則開啟、遊戲未結束且當前輪到黑棋 (1) 的時候，才計算禁手點
        if (rulesMode !== 'renju' || isGameOver || currentTurn !== 1) {
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
    function undoMove() {
        if (history.length === 0 || isGameOver || isAiThinking) return;

        // 播放悔棋音效
        playUndoSound();

        let stepsToUndo = 1;
        // 人機對戰模式下，按一次悔棋需要退兩步 (退 AI 與 玩家自己)
        if (gameMode === 'ai' && history.length >= 2) {
            stepsToUndo = 2;
        }

        // 退回指定步數
        let targetState = null;
        for (let i = 0; i < stepsToUndo; i++) {
            targetState = history.pop();
        }

        if (targetState) {
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
        }

        if (history.length === 0) {
            btnUndo.disabled = true;
        }
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

        // 依對戰模式顯示/隱藏 AI 難度設定
        if (mode === 'ai') {
            difficultyGroup.style.display = 'block';
        } else {
            difficultyGroup.style.display = 'none';
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
    // 事件監聽
    // ==========================================================================
    btnStart.addEventListener('click', () => {
        initAudio(); // 確保使用者互動觸發 AudioContext
        resetGame();
    });

    btnUndo.addEventListener('click', () => {
        undoMove();
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
                resetGame();
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

    // 啟動初始化
    initGame();
});
