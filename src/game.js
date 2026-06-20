export const BOARD_SIZE = 15;

// 單例狀態
export const state = {
    board: [],
    currentTurn: 1,
    isGameOver: false,
    gameMode: 'ai',        // 'ai' 或 'pvp'
    aiDifficulty: 'medium',// 'easy', 'medium', 'hard'
    history: [],           // 悔棋歷史
    lastMove: null,        // { r, c }
    playerColor: 1,        // 人機模式下玩家顏色 (1: 黑, 2: 白)
    nextGamePlayerColor: 1,
    rulesMode: 'standard', // 'standard' 或 'renju'
    p2pReconnecting: false,// P2P 是否正在重連
    stats: {
        playerWins: 0,
        aiWins: 0,
        draws: 0,
        pvpBlackWins: 0,
        pvpWhiteWins: 0
    }
};

let aiWorker = null;

export const game = {
    init() {
        state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
        state.currentTurn = 1;
        state.isGameOver = false;
        state.history = [];
        state.lastMove = null;
        this.terminateAI();
    },

    reset() {
        this.init();
    },

    // 進行落子
    makeMove(r, c, color) {
        if (state.isGameOver) return false;
        
        // 保存歷史快照
        state.history.push({
            board: state.board.map(row => [...row]),
            currentTurn: state.currentTurn,
            lastMove: state.lastMove ? { ...state.lastMove } : null
        });

        state.board[r][c] = color;
        state.lastMove = { r, c };
        
        // 檢查勝負
        const winResult = this.checkWin(r, c);
        if (winResult) {
            state.isGameOver = true;
            this.updateStats(winResult.winner);
            return { type: 'win', winner: winResult.winner, stones: winResult.stones };
        }

        // 檢查平局
        if (this.isBoardFull()) {
            state.isGameOver = true;
            state.stats.draws++;
            this.saveStats();
            return { type: 'draw' };
        }

        // 切換回合
        state.currentTurn = 3 - state.currentTurn;
        return { type: 'continue' };
    },

    // 歷史悔棋
    executeUndo(stepsToUndo) {
        if (state.history.length === 0 || state.isGameOver) return null;

        let targetState = null;
        const removedStones = [];

        // 對比找出被移走的棋子
        const currentStones = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (state.board[r][c] !== 0) {
                    currentStones.push({ r, c });
                }
            }
        }

        for (let i = 0; i < stepsToUndo; i++) {
            if (state.history.length > 0) {
                targetState = state.history.pop();
            }
        }

        if (targetState) {
            state.board = targetState.board;
            state.currentTurn = targetState.currentTurn;
            state.lastMove = targetState.lastMove;
            
            // 找出哪些棋子在 targetState 裡消失了
            currentStones.forEach(({ r, c }) => {
                if (state.board[r][c] === 0) {
                    removedStones.push({ r, c });
                }
            });
        }

        return {
            targetState,
            removedStones
        };
    },

    checkWin(r, c) {
        const color = state.board[r][c];
        if (color === 0) return null;

        const dirs = [
            { dr: 0, dc: 1 },
            { dr: 1, dc: 0 },
            { dr: 1, dc: 1 },
            { dr: 1, dc: -1 }
        ];

        for (let d = 0; d < dirs.length; d++) {
            const { dr, dc } = dirs[d];
            const winningStones = [{ r, c }];

            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && state.board[nr][nc] === color) {
                winningStones.push({ r: nr, c: nc });
                nr += dr;
                nc += dc;
            }

            nr = r - dr;
            nc = c - dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && state.board[nr][nc] === color) {
                winningStones.push({ r: nr, c: nc });
                nr -= dr;
                nc -= dc;
            }

            if (winningStones.length >= 5) {
                return {
                    winner: color,
                    stones: winningStones
                };
            }
        }
        return null;
    },

    isBoardFull() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (state.board[r][c] === 0) return false;
            }
        }
        return true;
    },

    checkForbidden(r, c) {
        if (state.rulesMode !== 'renju') return null;
        if (window.GomokuAI && typeof window.GomokuAI.checkForbidden === 'function') {
            return window.GomokuAI.checkForbidden(state.board, r, c, 1);
        }
        return null;
    },

    getForbiddenMoves() {
        const list = [];
        if (state.board.length === 0 || state.rulesMode !== 'renju' || state.isGameOver || state.currentTurn !== 1) {
            return list;
        }
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (state.board[r][c] === 0) {
                    if (this.checkForbidden(r, c)) {
                        list.push({ r, c });
                    }
                }
            }
        }
        return list;
    },

    completesFive(r, c, color) {
        state.board[r][c] = color;
        const win = this.checkWin(r, c);
        state.board[r][c] = 0;
        return win !== null;
    },

    createsLiveFour(r, c, color) {
        // 模擬在 (r, c) 落子
        state.board[r][c] = color;
        let formsFour = false;
        
        // 掃描方向
        const dirs = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];
        
        // 檢查在 (r, c) 落子後，是否會使同方向其他空格變成可以直接「成五」的點
        // 若能形成，即代表此落子能創造出「活四」或「衝四」威脅，需發出警告提示
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            for (let step = -4; step <= 4; step++) {
                if (step === 0) continue;
                const nr = r + step * dr;
                const nc = c + step * dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                    if (state.board[nr][nc] === 0) {
                        if (this.completesFive(nr, nc, color)) {
                            formsFour = true;
                            break;
                        }
                    }
                }
            }
            if (formsFour) break;
        }
        
        // 還原棋盤
        state.board[r][c] = 0;
        return formsFour;
    },

    // 威脅掃描
    getThreatHints(hintEnabled) {
        const hints = [];
        if (!hintEnabled || state.isGameOver || state.board.length === 0) return hints;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (state.board[r][c] === 0) {
                    const completesFiveBlack = this.completesFive(r, c, 1);
                    const completesFiveWhite = this.completesFive(r, c, 2);
                    const createsLiveFourBlack = this.createsLiveFour(r, c, 1);
                    const createsLiveFourWhite = this.createsLiveFour(r, c, 2);

                    const isFatal = completesFiveBlack || completesFiveWhite;
                    const isWarning = !isFatal && (createsLiveFourBlack || createsLiveFourWhite);

                    if (isFatal || isWarning) {
                        hints.push({
                            r, c,
                            isFatal,
                            isWarning,
                            black: completesFiveBlack || (isWarning && createsLiveFourBlack),
                            white: completesFiveWhite || (isWarning && createsLiveFourWhite)
                        });
                    }
                }
            }
        }
        return hints;
    },

    // AI 落子計算
    triggerAIMove(onStartThinking, onBestMove) {
        this.terminateAI();
        onStartThinking();

        try {
            aiWorker = new Worker('ai_worker.js?v=1.2.0');
            aiWorker.onmessage = (e) => {
                if (state.isGameOver) return;
                const { bestMove, error } = e.data;
                if (error) console.error("AI Worker Error:", error);
                this.terminateAI();
                onBestMove(bestMove);
            };
            aiWorker.postMessage({
                board: state.board,
                aiColor: 3 - state.playerColor,
                difficulty: state.aiDifficulty,
                rulesEnabled: state.rulesMode === 'renju'
            });
        } catch (e) {
            console.warn("Failed to create Web Worker, falling back to main thread.", e);
            setTimeout(() => {
                if (state.isGameOver) return;
                const bestMove = window.GomokuAI.getBestMove(state.board, 3 - state.playerColor, state.aiDifficulty, state.rulesMode === 'renju');
                onBestMove(bestMove);
            }, 400);
        }
    },

    terminateAI() {
        if (aiWorker) {
            aiWorker.terminate();
            aiWorker = null;
        }
    },

    // 數據管理
    updateStats(winner) {
        if (state.gameMode === 'ai') {
            if (winner === state.playerColor) state.stats.playerWins++;
            else state.stats.aiWins++;
        } else {
            if (winner === 1) state.stats.pvpBlackWins++;
            else state.stats.pvpWhiteWins++;
        }
        this.saveStats();
    },

    loadStats() {
        const saved = localStorage.getItem('gomoku_stats');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state.stats = { ...state.stats, ...parsed };
            } catch(e) {
                console.warn("Failed to parse stats", e);
            }
        }
    },

    saveStats() {
        localStorage.setItem('gomoku_stats', JSON.stringify(state.stats));
    },

    clearStats() {
        state.stats = {
            playerWins: 0,
            aiWins: 0,
            draws: 0,
            pvpBlackWins: 0,
            pvpWhiteWins: 0
        };
        this.saveStats();
    }
};
