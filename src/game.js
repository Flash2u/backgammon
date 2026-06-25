export const BOARD_SIZE = 15;

// 單例狀態
export const state = {
    board: [],
    currentTurn: 1,
    isGameOver: false,
    gameMode: 'ai',        // 'ai', 'pvp', 'p2p' 或 'puzzle'
    aiDifficulty: 'medium',// 'easy', 'medium', 'hard'
    history: [],           // 悔棋歷史快照
    moveRecord: [],        // 完整的對局落子歷史軌跡 [{r, c, color}]
    isReplayMode: false,   // 是否正處於對局復盤狀態
    replayIndex: 0,        // 復盤當前展示的手數
    currentPuzzleId: null, // 當前挑戰的殘局 ID (無則為 null)
    puzzleMovesUsed: 0,    // 殘局已用步數
    puzzleMaxMoves: 0,     // 殘局限制步數
    lastMove: null,        // { r, c }
    playerColor: 1,        // 玩家顏色 (1: 黑, 2: 白)
    nextGamePlayerColor: 1,
    rulesMode: 'standard', // 'standard' 或 'renju'
    hintEnabled: true,     // 預設開啟威脅提示
    viewMode: '2d',        // 預設 2D 視角
    p2pReconnecting: false,// P2P 是否正在重連
    timeLimitRule: 'none', // 'none' | '15s' | '30s' | '60s'
    roundSecondsLeft: 0,
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
        state.moveRecord = [];
        state.isReplayMode = false;
        state.replayIndex = 0;
        state.lastMove = null;
        state.roundSecondsLeft = this.getTimeLimitSeconds();
        this.terminateAI();
    },

    getTimeLimitSeconds() {
        if (state.timeLimitRule === '15s') return 15;
        if (state.timeLimitRule === '30s') return 30;
        if (state.timeLimitRule === '60s') return 60;
        return 0;
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

        // 記錄落子軌跡
        state.moveRecord.push({ r, c, color });

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
            if (state.moveRecord.length > 0) {
                state.moveRecord.pop();
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
        return win; // 回傳贏棋物件 { winner, stones } 或 null
    },

    createsLiveFour(r, c, color) {
        // 模擬在 (r, c) 落子
        state.board[r][c] = color;
        let matchedWindow = null;
        
        // 掃描方向
        const dirs = [
            [0, 1], [1, 0], [1, 1], [1, -1]
        ];
        
        // 滑動視窗檢測法：落子後，該方向必須包含至少一個 [0, color, color, color, color, 0] 的標準活四區間
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            
            // 視窗長度為 6，包含 (r, c)。(r, c) 可以位於視窗的索引 1, 2, 3, 4
            // 因此起點相對於 (r, c) 的偏移量 i 為 -4 到 -1
            for (let i = -4; i <= -1; i++) {
                let isMatch = true;
                const tempStones = [];
                
                for (let j = 0; j < 6; j++) {
                    const step = i + j;
                    const nr = r + step * dr;
                    const nc = c + step * dc;
                    
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
                        isMatch = false;
                        break;
                    }
                    
                    const val = state.board[nr][nc];
                    if (j === 0 || j === 5) {
                        if (val !== 0) {
                            isMatch = false;
                            break;
                        }
                    } else {
                        if (val !== color) {
                            isMatch = false;
                            break;
                        }
                        tempStones.push({ r: nr, c: nc });
                    }
                }
                
                if (isMatch) {
                    matchedWindow = {
                        stones: tempStones,
                        line: {
                            r1: r + i * dr,
                            c1: c + i * dc,
                            r2: r + (i + 5) * dr,
                            c2: c + (i + 5) * dc
                        }
                    };
                    break;
                }
            }
            if (matchedWindow) break;
        }
        
        // 還原棋盤
        state.board[r][c] = 0;
        return matchedWindow;
    },

    // 威脅掃描
    getThreatHints(hintEnabled) {
        const hints = [];
        if (!hintEnabled || state.isGameOver || state.board.length === 0) return hints;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (state.board[r][c] === 0) {
                    const c5Black = this.completesFive(r, c, 1);
                    const c5White = this.completesFive(r, c, 2);
                    const cl4Black = this.createsLiveFour(r, c, 1);
                    const cl4White = this.createsLiveFour(r, c, 2);

                    const completesFiveBlack = c5Black !== null;
                    const completesFiveWhite = c5White !== null;
                    const createsLiveFourBlack = cl4Black !== null;
                    const createsLiveFourWhite = cl4White !== null;

                    const isFatal = completesFiveBlack || completesFiveWhite;
                    const isWarning = !isFatal && (createsLiveFourBlack || createsLiveFourWhite);

                    if (isFatal || isWarning) {
                        let threatLine = null;
                        if (isFatal) {
                            const winObj = c5Black || c5White;
                            if (winObj && winObj.stones && winObj.stones.length > 0) {
                                const stones = [...winObj.stones];
                                // 對棋子進行 row 與 col 的雙重排序，以獲取精確的物理兩端點
                                stones.sort((a, b) => {
                                    if (a.r !== b.r) return a.r - b.r;
                                    return a.c - b.c;
                                });
                                const p1 = stones[0];
                                const p2 = stones[stones.length - 1];
                                threatLine = { r1: p1.r, c1: p1.c, r2: p2.r, c2: p2.c };
                            }
                        } else {
                            const l4Obj = cl4Black || cl4White;
                            if (l4Obj && l4Obj.line) {
                                threatLine = l4Obj.line;
                            }
                        }

                        hints.push({
                            r, c,
                            isFatal,
                            isWarning,
                            black: completesFiveBlack || (isWarning && createsLiveFourBlack),
                            white: completesFiveWhite || (isWarning && createsLiveFourWhite),
                            threatLine: threatLine
                        });
                    }
                }
            }
        }
        return hints;
    },

    // AI 落子計算
    triggerAIMove(onStartThinking, onBestMove, onProgress) {
        this.terminateAI();
        onStartThinking();

        try {
            aiWorker = new Worker('ai_worker.js?t=1782410803000');
            aiWorker.onmessage = (e) => {
                if (state.isGameOver) return;
                const { type, bestMove, progress, error } = e.data;
                if (type === 'progress' && onProgress) {
                    onProgress(progress);
                    return;
                }
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
    },

    getReplayBoard(index) {
        const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
        const limit = Math.min(index, state.moveRecord.length);
        for (let i = 0; i < limit; i++) {
            const m = state.moveRecord[i];
            board[m.r][m.c] = m.color;
        }
        return board;
    },

    exportToSGF() {
        let sgf = `(;SZ[15]AP[CyberGomoku:v1.9.5]GN[五子棋對局]DT[${new Date().toISOString().split('T')[0]}]`;
        
        // 判定黑白棋手名稱
        if (state.gameMode === 'ai') {
            if (state.playerColor === 1) {
                sgf += "PB[玩家]PW[AI]";
            } else {
                sgf += "PB[AI]PW[玩家]";
            }
        } else if (state.gameMode === 'p2p') {
            sgf += "PB[玩家(本機)]PW[好友(線上)]";
        } else if (state.gameMode === 'puzzle') {
            sgf += `PB[玩家]PW[殘局關卡_${state.currentPuzzleId}]`;
        } else {
            sgf += "PB[黑棋(雙人)]PW[白棋(雙人)]";
        }
        
        sgf += "\n";
        
        // 將 moveRecord 寫入
        state.moveRecord.forEach(move => {
            const colChar = String.fromCharCode(97 + move.c);
            const rowChar = String.fromCharCode(97 + move.r);
            const colorChar = move.color === 1 ? 'B' : 'W';
            sgf += `;${colorChar}[${colChar}${rowChar}]`;
        });
        
        sgf += ")";
        return sgf;
    },

    getBoardHash() {
        let hash = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const val = state.board[r][c];
                if (val !== 0) {
                    hash = (hash * 31 + (r * 15 + c) * val) | 0;
                }
            }
        }
        return hash;
    }
};











