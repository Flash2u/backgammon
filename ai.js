/**
 * ai.js
 * 五子棋 AI 核心演算法 - 支援多線程與 Zobrist 雜湊置換表
 * 同時支援瀏覽器主執行緒與 Web Worker 背景執行緒
 */

(function(global) {
    const BOARD_SIZE = 15;
    const SEGMENTS = [];
    const CELL_TO_SEGMENTS = Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => [])
    );

    // Zobrist 雜湊隨機數表
    const ZOBRIST_TABLE = Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => [0, 0, 0])
    );
    // 置換表 (Transposition Table)
    const TRANSPOSITION_TABLE = new Map();
    // 歷史啟發式得分表
    let HISTORY_TABLE = Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => [0, 0, 0])
    );

    // WebAssembly 載入宣告 (提供做簡單加載與加法/Hash累加加速測試)
    const WASM_BASE64 = 'AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABags=';
    let wasmInstance = null;
    let wasmEnabled = false;

    async function initWasm() {
        try {
            // 在瀏覽器或 Web Worker 環境中以 Base64 初始化 WebAssembly
            const binaryString = typeof atob !== 'undefined' ? atob(WASM_BASE64) : Buffer.from(WASM_BASE64, 'base64').toString('binary');
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const wasmModule = await WebAssembly.instantiate(bytes);
            wasmInstance = wasmModule.instance;
            wasmEnabled = true;
            console.log("WebAssembly AI Accelerator loaded successfully. Add(2,3) =", wasmInstance.exports.add(2, 3));
        } catch (e) {
            console.warn("WebAssembly load failed, falling back to pure JS core.", e);
            wasmEnabled = false;
        }
    }

    initWasm();

    const EXACT = 0;
    const LOWERBOUND = 1;
    const UPPERBOUND = 2;

    // ==========================================================================
    // 預先計算五子線段與初始化 Zobrist Table
    // ==========================================================================
    function precomputeSegments() {
        // 水平
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c <= BOARD_SIZE - 5; c++) {
                const seg = [[r, c], [r, c+1], [r, c+2], [r, c+3], [r, c+4]];
                seg.left = [r, c - 1];
                seg.right = [r, c + 5];
                SEGMENTS.push(seg);
            }
        }
        // 垂直
        for (let c = 0; c < BOARD_SIZE; c++) {
            for (let r = 0; r <= BOARD_SIZE - 5; r++) {
                const seg = [[r, c], [r+1, c], [r+2, c], [r+3, c], [r+4, c]];
                seg.left = [r - 1, c];
                seg.right = [r + 5, c];
                SEGMENTS.push(seg);
            }
        }
        // 斜下 (\)
        for (let r = 0; r <= BOARD_SIZE - 5; r++) {
            for (let c = 0; c <= BOARD_SIZE - 5; c++) {
                const seg = [[r, c], [r+1, c+1], [r+2, c+2], [r+3, c+3], [r+4, c+4]];
                seg.left = [r - 1, c - 1];
                seg.right = [r + 5, c + 5];
                SEGMENTS.push(seg);
            }
        }
        // 斜上 (/)
        for (let r = 4; r < BOARD_SIZE; r++) {
            for (let c = 0; c <= BOARD_SIZE - 5; c++) {
                const seg = [[r, c], [r-1, c+1], [r-2, c+2], [r-3, c+3], [r-4, c+4]];
                seg.left = [r + 1, c - 1];
                seg.right = [r - 5, c + 5];
                SEGMENTS.push(seg);
            }
        }

        // 建立格子到線段的索引對照
        for (let i = 0; i < SEGMENTS.length; i++) {
            const seg = SEGMENTS[i];
            for (let j = 0; j < 5; j++) {
                const [r, c] = seg[j];
                CELL_TO_SEGMENTS[r][c].push(i);
            }
        }
    }

    function initZobrist() {
        // 使用環境適配的隨機數生成器
        const cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                for (let color = 1; color <= 2; color++) {
                    if (cryptoObj && cryptoObj.getRandomValues) {
                        const arr = new Uint32Array(1);
                        cryptoObj.getRandomValues(arr);
                        ZOBRIST_TABLE[r][c][color] = arr[0];
                    } else {
                        ZOBRIST_TABLE[r][c][color] = Math.floor(Math.random() * 0xFFFFFFFF);
                    }
                }
            }
        }
    }

    precomputeSegments();
    initZobrist();

    // 計算整張棋盤目前的 Zobrist Hashing 值
    function computeBoardHash(board) {
        let hash = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const val = board[r][c];
                if (val !== 0) {
                    hash ^= ZOBRIST_TABLE[r][c][val];
                }
            }
        }
        return hash;
    }

    // ==========================================================================
    // 基礎勝負判定 (快取優化)
    // ==========================================================================
    function checkWinFromPos(board, r, c) {
        const color = board[r][c];
        if (color === 0) return false;

        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            let count = 1;

            let nr = r + dr; let nc = c + dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
                count++; nr += dr; nc += dc;
            }

            nr = r - dr; nc = c - dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === color) {
                count++; nr -= dr; nc -= dc;
            }

            if (count >= 5) return true;
        }
        return false;
    }

    // ==========================================================================
    // 禁手規則檢測 (Renju Rules) - 僅適用於黑棋 (1)
    // ==========================================================================
    function checkForbidden(board, r, c, color) {
        if (color !== 1) return false; // 只有黑棋限制禁手

        // 模擬黑棋落子
        board[r][c] = 1;

        let overline = false;
        let fourCount = 0;
        let liveThreeCount = 0;

        const dirs = [
            [0, 1],   // 水平
            [1, 0],   // 垂直
            [1, 1],   // 斜下 \
            [1, -1]   // 斜上 /
        ];

        // 1. 檢查長連 (Overline) - 黑棋連六顆子以上
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            let count = 1;

            let nr = r + dr; let nc = c + dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === 1) {
                count++; nr += dr; nc += dc;
            }

            nr = r - dr; nc = c - dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === 1) {
                count++; nr -= dr; nc -= dc;
            }

            if (count >= 6) {
                overline = true;
                break;
            }
        }

        if (overline) {
            board[r][c] = 0; // 復原
            return "overline"; // 長連禁手
        }

        // 2. 檢查雙四 (Double Four)
        // 四的定義：在此方向填入黑子能完成五連子。
        // 我們檢查該方向上距離 (r, c) 在 4 步以內的空格，若在其餘空格落黑子能贏，則構成四。
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            let winSpots = new Set();

            for (let i = -4; i <= 4; i++) {
                if (i === 0) continue;
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === 0) {
                    board[nr][nc] = 1;
                    const completes5 = checkWinFromPos(board, nr, nc);
                    board[nr][nc] = 0;
                    if (completes5) {
                        winSpots.add(`${nr},${nc}`);
                    }
                }
            }

            if (winSpots.size > 0) {
                fourCount++;
            }
        }

        if (fourCount >= 2) {
            board[r][c] = 0; // 復原
            return "double_four"; // 雙四禁手
        }

        // 3. 檢查雙三 (Double Three)
        // 活三的定義：落子後，可以在該方向上形成「活四」。
        // 我們檢查此方向上其餘空格 (er, ec)，若在此格落子會形成活四，即代表原位置 (r, c) 與該格連線在當前方向為活三。
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            let formsLiveFour = false;

            for (let i = -4; i <= 4; i++) {
                if (i === 0) continue;
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === 0) {
                    board[nr][nc] = 1;
                    const isLive4 = createsLiveFourInDirection(board, nr, nc, dr, dc, 1);
                    board[nr][nc] = 0;

                    if (isLive4) {
                        formsLiveFour = true;
                        break;
                    }
                }
            }

            if (formsLiveFour) {
                liveThreeCount++;
            }
        }

        board[r][c] = 0; // 復原

        if (liveThreeCount >= 2) {
            return "double_three"; // 雙三禁手
        }

        return false;
    }

    // 檢查在某方向上落子是否會形成活四 (兩端皆空且連續四子)
    function createsLiveFourInDirection(board, r, c, dr, dc, color) {
        let startR = r; let startC = c;
        while (startR - dr >= 0 && startR - dr < BOARD_SIZE && startC - dc >= 0 && startC - dc < BOARD_SIZE && board[startR - dr][startC - dc] === color) {
            startR -= dr; startC -= dc;
        }

        let endR = r; let endC = c;
        while (endR + dr >= 0 && endR + dr < BOARD_SIZE && endC + dc >= 0 && endC + dc < BOARD_SIZE && board[endR + dr][endC + dc] === color) {
            endR += dr; endC += dc;
        }

        let count = 0;
        if (dr !== 0) {
            count = Math.abs(endR - startR) / dr + 1;
        } else {
            count = Math.abs(endC - startC) / dc + 1;
        }

        if (count === 4) {
            const beforeR = startR - dr; const beforeC = startC - dc;
            const afterR = endR + dr; const afterC = endC + dc;

            const beforeEmpty = beforeR >= 0 && beforeR < BOARD_SIZE && beforeC >= 0 && beforeC < BOARD_SIZE && board[beforeR][beforeC] === 0;
            const afterEmpty = afterR >= 0 && afterR < BOARD_SIZE && afterC >= 0 && afterC < BOARD_SIZE && board[afterR][afterC] === 0;

            if (beforeEmpty && afterEmpty) {
                return true;
            }
        }
        return false;
    }

    // ==========================================================================
    // 局勢評估與評分 (Heuristic Scoring)
    // ==========================================================================
    // 輔助函數：評估單個 5 子區段對某種顏色的棋型得分
    function evaluateSegmentPattern(segment, color, board) {
        const oppColor = 3 - color;
        let myCount = 0;
        let oppCount = 0;
        
        // 快速提取 5 格的值
        const v0 = board[segment[0][0]][segment[0][1]];
        const v1 = board[segment[1][0]][segment[1][1]];
        const v2 = board[segment[2][0]][segment[2][1]];
        const v3 = board[segment[3][0]][segment[3][1]];
        const v4 = board[segment[4][0]][segment[4][1]];
        
        if (v0 === color) myCount++; else if (v0 === oppColor) oppCount++;
        if (v1 === color) myCount++; else if (v1 === oppColor) oppCount++;
        if (v2 === color) myCount++; else if (v2 === oppColor) oppCount++;
        if (v3 === color) myCount++; else if (v3 === oppColor) oppCount++;
        if (v4 === color) myCount++; else if (v4 === oppColor) oppCount++;
        
        if (myCount > 0 && oppCount > 0) return 0; // 混合區段無價值
        if (myCount === 0) return 0;
        
        // 5 個全滿，直接成五
        if (myCount === 5) return 10000000;
        
        // 讀取預先計算的外側座標
        const leftR = segment.left[0];
        const leftC = segment.left[1];
        const rightR = segment.right[0];
        const rightC = segment.right[1];
        
        const leftFree = leftR >= 0 && leftR < 15 && leftC >= 0 && leftC < 15 && board[leftR][leftC] === 0;
        const rightFree = rightR >= 0 && rightR < 15 && rightC >= 0 && rightC < 15 && board[rightR][rightC] === 0;
        
        if (myCount === 4) {
            // 4個子，1個空格
            if (v0 === 0) return rightFree ? 300000 : 80000; // 01111 活四 / 衝四
            if (v4 === 0) return leftFree ? 300000 : 80000;  // 11110 活四 / 衝四
            return 80000; // 10111, 11011, 11101 均為衝四 (死四)
        }
        
        if (myCount === 3) {
            // 3個子，2個空格
            // 01110 活三
            if (v0 === 0 && v4 === 0) {
                if (v1 === color && v2 === color && v3 === color) return 30000;
            }
            // 11100
            if (v0 === color && v1 === color && v2 === color && v3 === 0 && v4 === 0) {
                return leftFree ? 30000 : 3000;
            }
            // 00111
            if (v0 === 0 && v1 === 0 && v2 === color && v3 === color && v4 === color) {
                return rightFree ? 30000 : 3000;
            }
            // 跳活三/死三判斷
            if (v0 === 0 && v1 === color && v2 === 0 && v3 === color && v4 === color) {
                return rightFree ? 20000 : 3000; // 01011
            }
            if (v0 === color && v1 === color && v2 === 0 && v3 === color && v4 === 0) {
                return leftFree ? 20000 : 3000;  // 11010
            }
            if (v0 === 0 && v1 === color && v2 === color && v3 === 0 && v4 === color) {
                return rightFree ? 20000 : 3000; // 01101
            }
            if (v0 === color && v1 === 0 && v2 === color && v3 === color && v4 === 0) {
                return leftFree ? 20000 : 3000;  // 10110
            }
            if (v0 === color && v1 === 0 && v2 === color && v3 === 0 && v4 === color) {
                return (leftFree && rightFree) ? 15000 : 3000; // 10101
            }
            return 3000; // 其他死三 (衝三)
        }
        
        if (myCount === 2) {
            // 2個子，3個空格
            if ((v1 === color && v2 === color && v0 === 0 && v3 === 0) || 
                (v2 === color && v3 === color && v1 === 0 && v4 === 0)) {
                return 2000; // 活二
            }
            if (v0 === color && v1 === color && v2 === 0 && v3 === 0 && v4 === 0) {
                return leftFree ? 1000 : 200; // 11000
            }
            if (v0 === 0 && v1 === 0 && v2 === 0 && v3 === color && v4 === color) {
                return rightFree ? 1000 : 200; // 00011
            }
            if (v0 === 0 && v1 === color && v2 === 0 && v3 === color && v4 === 0) {
                return 1500; // 01010 跳活二
            }
            return 200; // 其他死二
        }
        
        return 80; // 1個子
    }

    // 局勢評估與評分 (Heuristic Scoring)
    function evaluateBoard(board, aiColor) {
        const playerColor = 3 - aiColor;
        let score = 0;

        const aiThreeSpots = new Map();
        const aiFourSpots = new Map();
        const playerThreeSpots = new Map();
        const playerFourSpots = new Map();

        for (let i = 0; i < SEGMENTS.length; i++) {
            const seg = SEGMENTS[i];
            
            // 計算 AI 的局勢評分
            const aiScore = evaluateSegmentPattern(seg, aiColor, board);
            
            // 計算玩家的局勢評分 (防守阻礙)
            const playerScore = evaluateSegmentPattern(seg, playerColor, board);
            
            score += aiScore;
            score -= playerScore * 1.5; // 提高對手得分的權重，主動防守

            // 統計 AI 的威脅點 (活三得分 >= 15000 且 < 80000; 活四/衝四得分 >= 80000)
            if (aiScore >= 80000) {
                for (let k = 0; k < 5; k++) {
                    const r = seg[k][0];
                    const c = seg[k][1];
                    if (board[r][c] === 0) {
                        const key = r * 15 + c;
                        aiFourSpots.set(key, (aiFourSpots.get(key) || 0) + 1);
                    }
                }
            } else if (aiScore >= 15000) {
                for (let k = 0; k < 5; k++) {
                    const r = seg[k][0];
                    const c = seg[k][1];
                    if (board[r][c] === 0) {
                        const key = r * 15 + c;
                        aiThreeSpots.set(key, (aiThreeSpots.get(key) || 0) + 1);
                    }
                }
            }

            // 統計玩家的威脅點
            if (playerScore >= 80000) {
                for (let k = 0; k < 5; k++) {
                    const r = seg[k][0];
                    const c = seg[k][1];
                    if (board[r][c] === 0) {
                        const key = r * 15 + c;
                        playerFourSpots.set(key, (playerFourSpots.get(key) || 0) + 1);
                    }
                }
            } else if (playerScore >= 15000) {
                for (let k = 0; k < 5; k++) {
                    const r = seg[k][0];
                    const c = seg[k][1];
                    if (board[r][c] === 0) {
                        const key = r * 15 + c;
                        playerThreeSpots.set(key, (playerThreeSpots.get(key) || 0) + 1);
                    }
                }
            }
        }

        // 計算交叉棋型加分與防守扣分
        const threatKeys = new Set([
            ...aiThreeSpots.keys(),
            ...aiFourSpots.keys(),
            ...playerThreeSpots.keys(),
            ...playerFourSpots.keys()
        ]);

        for (const key of threatKeys) {
            const ai3 = aiThreeSpots.get(key) || 0;
            const ai4 = aiFourSpots.get(key) || 0;
            const p3 = playerThreeSpots.get(key) || 0;
            const p4 = playerFourSpots.get(key) || 0;

            // AI 的交叉棋型加分
            if (ai3 >= 2) {
                score += 150000; // 雙活三
            }
            if (ai3 >= 1 && ai4 >= 1) {
                score += 300000; // 三四
            }
            if (ai4 >= 2) {
                score += 100000; // 雙四
            }

            // 玩家的交叉棋型扣分 (防守加分)
            if (p3 >= 2) {
                score -= 240000; // 雙活三防守 (150000 * 1.6)
            }
            if (p3 >= 1 && p4 >= 1) {
                score -= 480000; // 三四防守 (300000 * 1.6)
            }
            if (p4 >= 2) {
                score -= 160000; // 雙四防守 (100000 * 1.6)
            }
        }

        return score;
    }

    // 獲取某一空格落子後的即時攻防分數 (著法排序優化用)
    function getImmediateScore(board, r, c, color) {
        const oppColor = 3 - color;
        let score = 0;
        const segIndices = CELL_TO_SEGMENTS[r][c];

        let myThreeCount = 0;
        let myFourCount = 0;
        let oppThreeCount = 0;
        let oppFourCount = 0;

        for (let i = 0; i < segIndices.length; i++) {
            const seg = SEGMENTS[segIndices[i]];
            
            // 模擬我方落子
            board[r][c] = color;
            const myScore = evaluateSegmentPattern(seg, color, board);
            board[r][c] = 0;
            
            if (myScore >= 80000) {
                myFourCount++;
            } else if (myScore >= 15000) {
                myThreeCount++;
            }
            
            // 模擬對手落子 (阻礙分數)
            board[r][c] = oppColor;
            const oppScore = evaluateSegmentPattern(seg, oppColor, board);
            board[r][c] = 0;
            
            if (oppScore >= 80000) {
                oppFourCount++;
            } else if (oppScore >= 15000) {
                oppThreeCount++;
            }
            
            score += myScore + oppScore * 1.2;
        }

        // 著法排序中的交叉棋型加分
        if (myThreeCount >= 2) score += 150000; // 雙活三
        if (myThreeCount >= 1 && myFourCount >= 1) score += 300000; // 三四
        if (myFourCount >= 2) score += 100000; // 雙四

        if (oppThreeCount >= 2) score += 180000; // 防守雙活三 (150000 * 1.2)
        if (oppThreeCount >= 1 && oppFourCount >= 1) score += 360000; // 防守三四
        if (oppFourCount >= 2) score += 120000; // 防守雙四

        return score;
    }

    // 獲取現有棋子周圍 2 格範圍內的空格作為候選點
    function getCandidates(board) {
        const candidates = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) {
                    let hasNeighbor = false;
                    const rStart = Math.max(0, r - 2);
                    const rEnd = Math.min(BOARD_SIZE - 1, r + 2);
                    const cStart = Math.max(0, c - 2);
                    const cEnd = Math.min(BOARD_SIZE - 1, c + 2);

                    for (let nr = rStart; nr <= rEnd; nr++) {
                        for (let nc = cStart; nc <= cEnd; nc++) {
                            if (board[nr][nc] !== 0) {
                                hasNeighbor = true;
                                break;
                            }
                        }
                        if (hasNeighbor) break;
                    }

                    if (hasNeighbor) {
                        candidates.push({ r, c });
                    }
                }
            }
        }
        if (candidates.length === 0) {
            candidates.push({ r: 7, c: 7 });
        }
        return candidates;
    }

    // 殺手步啟發式 (Killer Heuristic) 陣列
    let KILLER_MOVES = [];

    // 超時控制與搜尋統計
    let isSearchTimeout = false;
    let startTime = 0;
    const timeLimit = 1500; // 1.5 秒單步時間限制
    let nodeCount = 0;

    // ==========================================================================
    // VCF (Victory by Continuous Four) 連續衝四勝專屬搜尋器
    // ==========================================================================
    function findFourMoves(board, color, rulesEnabled = false) {
        const moves = [];
        const candidates = getCandidates(board);
        for (let i = 0; i < candidates.length; i++) {
            const pos = candidates[i];
            
            // 禁手規則啟用且進攻方為黑棋，檢查該落子點是否為禁手
            if (rulesEnabled && color === 1) {
                if (checkForbidden(board, pos.r, pos.c, 1)) {
                    continue;
                }
            }
            
            board[pos.r][pos.c] = color;
            
            let winSpots = [];
            const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
            for (let d = 0; d < dirs.length; d++) {
                const [dr, dc] = dirs[d];
                for (let step = -4; step <= 4; step++) {
                    if (step === 0) continue;
                    const nr = pos.r + step * dr;
                    const nc = pos.c + step * dc;
                    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                        if (board[nr][nc] === 0) {
                            board[nr][nc] = color;
                            const isWin = checkWinFromPos(board, nr, nc);
                            board[nr][nc] = 0;
                            if (isWin) {
                                if (!winSpots.some(p => p.r === nr && p.c === nc)) {
                                    winSpots.push({ r: nr, c: nc });
                                }
                            }
                        }
                    }
                }
            }
            
            board[pos.r][pos.c] = 0; // 復原
            
            if (winSpots.length > 0) {
                moves.push({
                    attack: pos,
                    defends: winSpots
                });
            }
        }
        return moves;
    }

    function solveVCF(board, color, maxDepth = 10, rulesEnabled = false) {
        const oppColor = 3 - color;
        
        function vcfSearch(depth) {
            if (depth <= 0) return null;
            
            // 1. 檢查是否能一步成五贏棋
            const candidates = getCandidates(board);
            for (let i = 0; i < candidates.length; i++) {
                const pos = candidates[i];
                
                // 禁手規則啟用且進攻方為黑棋，成五點亦不能是禁手（例如排除長連禁手）
                if (rulesEnabled && color === 1) {
                    if (checkForbidden(board, pos.r, pos.c, 1)) {
                        continue;
                    }
                }
                
                board[pos.r][pos.c] = color;
                const isWin = checkWinFromPos(board, pos.r, pos.c);
                board[pos.r][pos.c] = 0;
                if (isWin) {
                    return [pos];
                }
            }
            
            // 2. 搜尋衝四點
            const moves = findFourMoves(board, color, rulesEnabled);
            
            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                const attack = move.attack;
                
                board[attack.r][attack.c] = color;
                
                if (move.defends.length >= 2) {
                    // 形成活四，必勝
                    board[attack.r][attack.c] = 0;
                    return [attack];
                }
                
                if (move.defends.length === 1) {
                    const defend = move.defends[0];
                    board[defend.r][defend.c] = oppColor;
                    
                    const subPath = vcfSearch(depth - 1);
                    
                    board[defend.r][defend.c] = 0;
                    board[attack.r][attack.c] = 0;
                    
                    if (subPath !== null) {
                        return [attack, defend].concat(subPath);
                    }
                } else {
                    board[attack.r][attack.c] = 0;
                }
            }
            return null;
        }
        
        return vcfSearch(maxDepth);
    }

    // ==========================================================================
    // Minimax 搜尋與 Alpha-Beta 剪枝 (帶有置換表、超時中斷與殺手步啟發式)
    // ==========================================================================
    function minimax(board, depth, alpha, beta, isMaximizing, aiColor, lastR, lastC, hash, rulesEnabled) {
        nodeCount++;
        // 每 128 個節點檢查一次超時，以兼顧效能與靈敏度
        if (nodeCount % 128 === 0) {
            if (Date.now() - startTime > timeLimit) {
                isSearchTimeout = true;
            }
        }
        if (isSearchTimeout) return 0;

        const oppColor = 3 - aiColor;
        const originalAlpha = alpha;
        const originalBeta = beta;

        // 查詢置換表 (TT)
        const ttEntry = TRANSPOSITION_TABLE.get(hash);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === EXACT) {
                return ttEntry.score;
            } else if (ttEntry.flag === LOWERBOUND) {
                alpha = Math.max(alpha, ttEntry.score);
            } else if (ttEntry.flag === UPPERBOUND) {
                beta = Math.min(beta, ttEntry.score);
            }
            if (alpha >= beta) {
                return ttEntry.score;
            }
        }

        // 葉節點勝負檢查
        if (lastR !== undefined && lastC !== undefined) {
            if (checkWinFromPos(board, lastR, lastC)) {
                // 越早獲勝得分越高，越晚獲勝得分越低
                return isMaximizing ? (-100000000 + (5 - depth)) : (100000000 - (5 - depth));
            }
        }

        if (depth === 0) {
            return evaluateBoard(board, aiColor);
        }

        // --- 空步剪枝 (Null Move Pruning) ---
        if (isMaximizing && depth >= 3 && lastR !== undefined) {
            const staticEval = evaluateBoard(board, aiColor);
            if (staticEval >= beta) {
                // R = 2. 傳入 undefined 避免勝負檢查
                const nullMoveEval = minimax(board, depth - 1 - 2, alpha, beta, false, aiColor, undefined, undefined, hash, rulesEnabled);
                if (nullMoveEval >= beta) {
                    return beta; // 截斷
                }
            }
        }

        const candidates = getCandidates(board);
        if (candidates.length === 0) return 0;

        const activeColor = isMaximizing ? aiColor : oppColor;
        const scoredCandidates = [];
        const ttBestMove = ttEntry ? ttEntry.bestMove : null;

        for (let i = 0; i < candidates.length; i++) {
            const pos = candidates[i];

            // 禁手規則啟用且當前模擬落子方為黑棋 (1)，檢查禁手
            if (rulesEnabled && activeColor === 1) {
                if (checkForbidden(board, pos.r, pos.c, 1)) {
                    continue; // 禁手點，黑棋不能下，直接排除候選
                }
            }

            // 基礎局勢評分
            let score = getImmediateScore(board, pos.r, pos.c, aiColor) + 
                          getImmediateScore(board, pos.r, pos.c, oppColor) * 1.15;

            // 著法排序優化：置換表最優步加成
            if (ttBestMove && ttBestMove.r === pos.r && ttBestMove.c === pos.c) {
                score += 10000000;
            }
            // 著法排序優化：殺手步加成
            const killer = KILLER_MOVES[depth];
            if (killer && killer.r === pos.r && killer.c === pos.c) {
                score += 500000;
            }
            // 歷史啟發式加成
            score += (HISTORY_TABLE[pos.r][pos.c][activeColor] || 0);

            scoredCandidates.push({ r: pos.r, c: pos.c, score });
        }

        if (scoredCandidates.length === 0) {
            // 黑棋無棋可下（所有點皆為禁手點），被動輸局
            return isMaximizing ? -90000000 : 90000000;
        }

        // 排序候選點以加速剪枝
        scoredCandidates.sort((a, b) => b.score - a.score);

        let bestMove = null;
        if (isMaximizing) {
            let maxEval = -Infinity;
            const isFutilityOk = (depth === 1);
            const staticEval = isFutilityOk ? evaluateBoard(board, aiColor) : 0;
            
            for (let i = 0; i < scoredCandidates.length; i++) {
                const move = scoredCandidates[i];
                
                // --- 無用剪枝 (Futility Pruning) ---
                if (isFutilityOk) {
                    if (staticEval + move.score < alpha) {
                        continue;
                    }
                }
                
                board[move.r][move.c] = aiColor;
                const nextHash = hash ^ ZOBRIST_TABLE[move.r][move.c][aiColor];
                const evalVal = minimax(board, depth - 1, alpha, beta, false, aiColor, move.r, move.c, nextHash, rulesEnabled);
                board[move.r][move.c] = 0; // 復原

                if (evalVal > maxEval) {
                    maxEval = evalVal;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evalVal);
                if (beta <= alpha) {
                    KILLER_MOVES[depth] = move; // 記錄引發剪枝的殺手步
                    HISTORY_TABLE[move.r][move.c][aiColor] += (1 << depth); // 歷史啟發加分
                    break; // Beta 剪枝
                }
            }

            // 只有當搜尋未超時且結果完整時才寫入置換表，防範快取污染
            if (!isSearchTimeout) {
                let flag = EXACT;
                if (maxEval <= originalAlpha) flag = UPPERBOUND;
                else if (maxEval >= beta) flag = LOWERBOUND;
                
                // 限制置換表容量在 100,000 以內 (LRU 淘汰)
                if (TRANSPOSITION_TABLE.size >= 100000) {
                    const firstKey = TRANSPOSITION_TABLE.keys().next().value;
                    TRANSPOSITION_TABLE.delete(firstKey);
                }
                TRANSPOSITION_TABLE.set(hash, { depth, score: maxEval, flag, bestMove });
            }

            return maxEval;
        } else {
            let minEval = Infinity;
            for (let i = 0; i < scoredCandidates.length; i++) {
                const move = scoredCandidates[i];
                board[move.r][move.c] = oppColor;
                const nextHash = hash ^ ZOBRIST_TABLE[move.r][move.c][oppColor];
                const evalVal = minimax(board, depth - 1, alpha, beta, true, aiColor, move.r, move.c, nextHash, rulesEnabled);
                board[move.r][move.c] = 0; // 復原

                if (evalVal < minEval) {
                    minEval = evalVal;
                    bestMove = move;
                }
                beta = Math.min(beta, evalVal);
                if (beta <= alpha) {
                    KILLER_MOVES[depth] = move; // 記錄引發剪枝的殺手步
                    HISTORY_TABLE[move.r][move.c][oppColor] += (1 << depth); // 歷史啟發加分
                    break; // Alpha 剪枝
                }
            }

            // 只有當搜尋未超時且結果完整時才寫入置換表，防範快取污染
            if (!isSearchTimeout) {
                let flag = EXACT;
                if (minEval <= originalAlpha) flag = UPPERBOUND;
                else if (minEval >= originalBeta) flag = LOWERBOUND;
                
                // 限制置換表容量在 100,000 以內 (LRU 淘汰)
                if (TRANSPOSITION_TABLE.size >= 100000) {
                    const firstKey = TRANSPOSITION_TABLE.keys().next().value;
                    TRANSPOSITION_TABLE.delete(firstKey);
                }
                TRANSPOSITION_TABLE.set(hash, { depth, score: minEval, flag, bestMove });
            }

            return minEval;
        }
    }

    // ==========================================================================
    // VCT (Victory by Continuous Threat) 連續威脅勝搜尋
    // ==========================================================================
    function createsLiveFour(board, r, c, color) {
        board[r][c] = color;
        let formsLiveFour = false;
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            if (createsLiveFourInDirection(board, r, c, dr, dc, color)) {
                formsLiveFour = true;
                break;
            }
        }
        board[r][c] = 0;
        return formsLiveFour;
    }

    function getLiveFourDefends(board, r, c, color) {
        board[r][c] = color;
        const defends = [];
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        
        for (let d = 0; d < dirs.length; d++) {
            const [dr, dc] = dirs[d];
            let startR = r; let startC = c;
            while (startR - dr >= 0 && startR - dr < BOARD_SIZE && startC - dc >= 0 && startC - dc < BOARD_SIZE && board[startR - dr][startC - dc] === color) {
                startR -= dr; startC -= dc;
            }
            let endR = r; let endC = c;
            while (endR + dr >= 0 && endR + dr < BOARD_SIZE && endC + dc >= 0 && endC + dc < BOARD_SIZE && board[endR + dr][endC + dc] === color) {
                endR += dr; endC += dc;
            }
            
            let count = 0;
            if (dr !== 0) {
                count = Math.abs(endR - startR) / dr + 1;
            } else {
                count = Math.abs(endC - startC) / dc + 1;
            }
            
            if (count === 4) {
                const beforeR = startR - dr; const beforeC = startC - dc;
                const afterR = endR + dr; const afterC = endC + dc;
                
                if (beforeR >= 0 && beforeR < BOARD_SIZE && beforeC >= 0 && beforeC < BOARD_SIZE && board[beforeR][beforeC] === 0) {
                    defends.push({ r: beforeR, c: beforeC });
                }
                if (afterR >= 0 && afterR < BOARD_SIZE && afterC >= 0 && afterC < BOARD_SIZE && board[afterR][afterC] === 0) {
                    defends.push({ r: afterR, c: afterC });
                }
            }
        }
        board[r][c] = 0;
        return defends;
    }

    function solveVCT(board, color, maxDepth = 8, rulesEnabled = false) {
        const oppColor = 3 - color;
        const VCT_CACHE = new Map();
        const startHash = computeBoardHash(board);
        
        function vctSearch(depth, hash) {
            if (depth <= 0) return null;
            
            // 查詢 VCT 快取 (Zobrist Hash 快速剪枝)
            const cached = VCT_CACHE.get(hash);
            if (cached && cached.depth >= depth) {
                return cached.path;
            }
            
            let result = null;
            const candidates = getCandidates(board);
            
            // 1. 檢查是否能一步成五贏棋
            for (let i = 0; i < candidates.length; i++) {
                const pos = candidates[i];
                if (rulesEnabled && color === 1 && checkForbidden(board, pos.r, pos.c, 1)) continue;
                
                board[pos.r][pos.c] = color;
                const isWin = checkWinFromPos(board, pos.r, pos.c);
                board[pos.r][pos.c] = 0;
                if (isWin) {
                    result = [pos];
                    break;
                }
            }
            
            if (result === null) {
                // 2. 搜尋衝四點 (VCF)
                const fourMoves = findFourMoves(board, color, rulesEnabled);
                for (let i = 0; i < fourMoves.length; i++) {
                    const move = fourMoves[i];
                    const attack = move.attack;
                    board[attack.r][attack.c] = color;
                    const nextHashAttack = hash ^ ZOBRIST_TABLE[attack.r][attack.c][color];
                    
                    if (move.defends.length >= 2) {
                        board[attack.r][attack.c] = 0;
                        result = [attack];
                        break;
                    }
                    
                    if (move.defends.length === 1) {
                        const defend = move.defends[0];
                        board[defend.r][defend.c] = oppColor;
                        const nextHashDefend = nextHashAttack ^ ZOBRIST_TABLE[defend.r][defend.c][oppColor];
                        
                        const subPath = vctSearch(depth - 1, nextHashDefend);
                        
                        board[defend.r][defend.c] = 0;
                        board[attack.r][attack.c] = 0;
                        
                        if (subPath !== null) {
                            result = [attack, defend].concat(subPath);
                            break;
                        }
                    } else {
                        board[attack.r][attack.c] = 0;
                    }
                }
            }
            
            if (result === null) {
                // 3. 搜尋活三點 (VCT)
                const threeMoves = [];
                for (let i = 0; i < candidates.length; i++) {
                    const pos = candidates[i];
                    if (rulesEnabled && color === 1 && checkForbidden(board, pos.r, pos.c, 1)) continue;
                    
                    if (createsLiveFour(board, pos.r, pos.c, color)) {
                        const defends = getLiveFourDefends(board, pos.r, pos.c, color);
                        if (defends.length > 0) {
                            threeMoves.push({
                                attack: pos,
                                defends: defends
                            });
                        }
                    }
                }
                
                // VCT 著法排序：優先探測攻防估分高的威脅點
                threeMoves.sort((a, b) => {
                    return getImmediateScore(board, b.attack.r, b.attack.c, color) - 
                           getImmediateScore(board, a.attack.r, a.attack.c, color);
                });
                
                for (let i = 0; i < threeMoves.length; i++) {
                    const move = threeMoves[i];
                    const attack = move.attack;
                    
                    board[attack.r][attack.c] = color;
                    const nextHashAttack = hash ^ ZOBRIST_TABLE[attack.r][attack.c][color];
                    
                    let allDefendsSucceed = true;
                    const fullPath = [];
                    
                    for (let j = 0; j < move.defends.length; j++) {
                        const def = move.defends[j];
                        board[def.r][def.c] = oppColor;
                        const nextHashDefend = nextHashAttack ^ ZOBRIST_TABLE[def.r][def.c][oppColor];
                        
                        const subPath = vctSearch(depth - 1, nextHashDefend);
                        board[def.r][def.c] = 0;
                        
                        if (subPath === null) {
                            allDefendsSucceed = false;
                            break;
                        } else {
                            fullPath.push({ defend: def, path: subPath });
                        }
                    }
                    
                    board[attack.r][attack.c] = 0;
                    
                    if (allDefendsSucceed && move.defends.length > 0) {
                        const choice = fullPath[0];
                        result = [attack, choice.defend].concat(choice.path);
                        break;
                    }
                }
            }
            
            // 寫入 VCT 快取 (LRU 淘汰)
            if (VCT_CACHE.size >= 50000) {
                const firstKey = VCT_CACHE.keys().next().value;
                VCT_CACHE.delete(firstKey);
            }
            VCT_CACHE.set(hash, { depth, path: result });
            
            return result;
        }
        
        return vctSearch(maxDepth, startHash);
    }

    // ==========================================================================
    // 對外 API
    // ==========================================================================
    const GomokuAI = {
        /**
         * 檢查黑棋在指定位置落子是否為禁手
         * @param {Array} board 15x15 棋盤
         * @param {Number} r 列
         * @param {Number} c 行
         * @param {Number} color 顏色 (1: 黑, 2: 白)
         * @returns {String|Boolean} 禁手類型或 false
         */
        checkForbidden(board, r, c, color) {
            return checkForbidden(board, r, c, color);
        },

        /**
         * 獲取最佳落子位置
         * @param {Array} board 15x15 棋盤
         * @param {Number} aiColor AI顏色 (1: 黑, 2: 白)
         * @param {String} difficulty 難度
         * @param {Boolean} rulesEnabled 是否開啟禁手
         * @returns {Object} 最佳落子座標 {r, c}
         */
        getBestMove(board, aiColor, difficulty, rulesEnabled = false, onProgress = null) {
            const playerColor = 3 - aiColor;
            const candidates = getCandidates(board);

            // 輔助函數：從置換表中提取 PV 路徑
            function getPVPath(boardState, currentColor, firstMove, rulesOn) {
                const pv = [];
                if (!firstMove) return pv;
                pv.push(firstMove);
                
                const tempBoard = Array(BOARD_SIZE).fill(null).map((_, r) => [...boardState[r]]);
                let currentHash = computeBoardHash(tempBoard);
                let color = currentColor;
                
                // 模擬第一步落子
                tempBoard[firstMove.r][firstMove.c] = color;
                currentHash = currentHash ^ ZOBRIST_TABLE[firstMove.r][firstMove.c][color];
                
                // 最多探索 4 步 (包含首步共 5 步)
                for (let step = 0; step < 4; step++) {
                    color = 3 - color; // 切換方
                    const entry = TRANSPOSITION_TABLE.get(currentHash);
                    if (entry && entry.bestMove) {
                        const m = entry.bestMove;
                        if (m.r >= 0 && m.r < BOARD_SIZE && m.c >= 0 && m.c < BOARD_SIZE && tempBoard[m.r][m.c] === 0) {
                            pv.push(m);
                            tempBoard[m.r][m.c] = color;
                            currentHash = currentHash ^ ZOBRIST_TABLE[m.r][m.c][color];
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                return pv;
            }

            // ==========================================================================
            // 強制性進攻與防守檢測 (最高優先級，不限難度)
            // ==========================================================================
            const myWinMoves = [];       // AI 自身成五點 (Priority 1)
            const oppWinMoves = [];      // 對手成五點 (Priority 2)
            const myLiveFourMoves = [];  // AI 自身成活四點 (Priority 3)
            const oppLiveFourMoves = []; // 對手成活四點 (Priority 4)

            for (let i = 0; i < candidates.length; i++) {
                const pos = candidates[i];
                
                // 1. 檢查自己是否能一步成五 (若為黑棋且啟用禁手，過濾禁手點)
                let isMyWin = false;
                if (!(rulesEnabled && aiColor === 1 && checkForbidden(board, pos.r, pos.c, 1))) {
                    board[pos.r][pos.c] = aiColor;
                    if (checkWinFromPos(board, pos.r, pos.c)) {
                        isMyWin = true;
                    }
                    board[pos.r][pos.c] = 0;
                }
                if (isMyWin) {
                    myWinMoves.push(pos);
                }

                // 2. 檢查對手是否能一步成五 (若對手是黑棋且啟用禁手，過濾對手禁手點)
                let isOppWin = false;
                if (!(rulesEnabled && playerColor === 1 && checkForbidden(board, pos.r, pos.c, 1))) {
                    board[pos.r][pos.c] = playerColor;
                    if (checkWinFromPos(board, pos.r, pos.c)) {
                        isOppWin = true;
                    }
                    board[pos.r][pos.c] = 0;
                }
                if (isOppWin) {
                    // AI 去封堵該點時，對 AI 而言不能是禁手點 (若 AI 是黑棋且啟用禁手)
                    if (!(rulesEnabled && aiColor === 1 && checkForbidden(board, pos.r, pos.c, 1))) {
                        oppWinMoves.push(pos);
                    }
                }

                // 3. 檢查自己是否能一步成活四 (若為黑棋且啟用禁手，過濾禁手點)
                let isMyLiveFour = false;
                if (!(rulesEnabled && aiColor === 1 && checkForbidden(board, pos.r, pos.c, 1))) {
                    if (createsLiveFour(board, pos.r, pos.c, aiColor)) {
                        isMyLiveFour = true;
                    }
                }
                if (isMyLiveFour) {
                    myLiveFourMoves.push(pos);
                }

                // 4. 檢查對手是否能一步成活四 (若對手是黑棋且啟用禁手，過濾對手禁手點)
                let isOppLiveFour = false;
                if (!(rulesEnabled && playerColor === 1 && checkForbidden(board, pos.r, pos.c, 1))) {
                    if (createsLiveFour(board, pos.r, pos.c, playerColor)) {
                        isOppLiveFour = true;
                    }
                }
                if (isOppLiveFour) {
                    // AI 去封堵該點時，對 AI 而言不能是禁手點 (若 AI 是黑棋且啟用禁手)
                    if (!(rulesEnabled && aiColor === 1 && checkForbidden(board, pos.r, pos.c, 1))) {
                        oppLiveFourMoves.push(pos);
                    }
                }
            }

            // 優先級 1：自己有一步成五點，直接落子贏得比賽
            if (myWinMoves.length > 0) {
                console.log("Immediate win detected for AI!", myWinMoves[0]);
                return myWinMoves[0];
            }

            // 優先級 2：對手有一步成五點 (即死四/活四)，AI 必須落子在此進行阻擋
            if (oppWinMoves.length > 0) {
                console.log("Immediate threat detected! Opponent can win. Defending at:", oppWinMoves[0]);
                // 若有多個防守點 (活四兩端)，選擇對 AI 局勢最有利的點
                if (oppWinMoves.length > 1) {
                    let bestDefMove = oppWinMoves[0];
                    let maxScore = -Infinity;
                    for (let i = 0; i < oppWinMoves.length; i++) {
                        const move = oppWinMoves[i];
                        const score = getImmediateScore(board, move.r, move.c, aiColor);
                        if (score > maxScore) {
                            maxScore = score;
                            bestDefMove = move;
                        }
                    }
                    return bestDefMove;
                }
                return oppWinMoves[0];
            }

            // 優先級 3：自己有一步成活四點，優先落子形成必勝局勢 (前提是對手這一步無法成五)
            if (myLiveFourMoves.length > 0) {
                console.log("AI can create a Live Four! Playing at:", myLiveFourMoves[0]);
                // 若有多個成活四點，選擇評分最高的點
                if (myLiveFourMoves.length > 1) {
                    let bestLiveFourMove = myLiveFourMoves[0];
                    let maxScore = -Infinity;
                    for (let i = 0; i < myLiveFourMoves.length; i++) {
                        const move = myLiveFourMoves[i];
                        const score = getImmediateScore(board, move.r, move.c, aiColor);
                        if (score > maxScore) {
                            maxScore = score;
                            bestLiveFourMove = move;
                        }
                    }
                    return bestLiveFourMove;
                }
                return myLiveFourMoves[0];
            }

            // 優先級 4：對手有一步成活四點 (即活三/雙活三)，AI 必須落子封堵
            if (oppLiveFourMoves.length > 0) {
                console.log("Opponent can create a Live Four! Defending at:", oppLiveFourMoves[0]);
                // 若有多個封堵點 (例如雙活三或單活三兩端)，選擇對 AI 局勢最有利的點
                if (oppLiveFourMoves.length > 1) {
                    let bestDefMove = oppLiveFourMoves[0];
                    let maxScore = -Infinity;
                    for (let i = 0; i < oppLiveFourMoves.length; i++) {
                        const move = oppLiveFourMoves[i];
                        const score = getImmediateScore(board, move.r, move.c, aiColor);
                        if (score > maxScore) {
                            maxScore = score;
                            bestDefMove = move;
                        }
                    }
                    return bestDefMove;
                }
                return oppLiveFourMoves[0];
            }

            // 1. 簡單難度 (Easy)
            if (difficulty === 'easy') {
                const scoredCandidates = [];
                for (let i = 0; i < candidates.length; i++) {
                    const pos = candidates[i];
                    if (rulesEnabled && aiColor === 1) {
                        if (checkForbidden(board, pos.r, pos.c, 1)) continue;
                    }
                    const score = getImmediateScore(board, pos.r, pos.c, aiColor) + 
                                  getImmediateScore(board, pos.r, pos.c, playerColor) * 0.8;
                    scoredCandidates.push({ r: pos.r, c: pos.c, score });
                }

                if (scoredCandidates.length === 0) return candidates[0];

                if (Math.random() < 0.35) {
                    return scoredCandidates[Math.floor(Math.random() * scoredCandidates.length)];
                }
                scoredCandidates.sort((a, b) => b.score - a.score);
                const pool = Math.min(scoredCandidates.length, 5);
                return scoredCandidates[Math.floor(Math.random() * pool)];
            }

            // 2. 中等難度 (Medium)
            if (difficulty === 'medium') {
                const scoredCandidates = [];
                for (let i = 0; i < candidates.length; i++) {
                    const pos = candidates[i];
                    if (rulesEnabled && aiColor === 1) {
                        if (checkForbidden(board, pos.r, pos.c, 1)) continue;
                    }
                    const score = getImmediateScore(board, pos.r, pos.c, aiColor) + 
                                  getImmediateScore(board, pos.r, pos.c, playerColor) * 1.15;
                    scoredCandidates.push({ r: pos.r, c: pos.c, score });
                }

                if (scoredCandidates.length === 0) return candidates[0];

                scoredCandidates.sort((a, b) => b.score - a.score);
                const maxVal = scoredCandidates[0].score;
                const pool = scoredCandidates.filter(item => item.score === maxVal);
                return pool[Math.floor(Math.random() * pool.length)];
            }

            // 3. 困難難度 (Hard)：採用 VCF 絕殺探測 + 迭代加深搜尋 (IDS) 搭置換表與殺手步
            if (difficulty === 'hard') {
                let stoneCount = 0;
                for (let r = 0; r < BOARD_SIZE; r++) {
                    for (let c = 0; c < BOARD_SIZE; c++) {
                        if (board[r][c] !== 0) stoneCount++;
                    }
                }
                // 開局第一手落天元
                if (stoneCount === 0) {
                    return { r: 7, c: 7 };
                }

                // 開局第二手 (AI 執白第一步，最優直防/斜防)
                if (stoneCount === 1) {
                    return Math.random() < 0.5 ? { r: 7, c: 8 } : { r: 8, c: 8 };
                }

                // 開局第三手 (AI 執黑第二步，發動最強花月必勝開局)
                if (stoneCount === 2) {
                    let w2 = null;
                    for (let r = 0; r < BOARD_SIZE; r++) {
                        for (let c = 0; c < BOARD_SIZE; c++) {
                            if (board[r][c] === 2) {
                                w2 = { r, c };
                                break;
                            }
                        }
                        if (w2) break;
                    }
                    
                    if (w2) {
                        const dr = w2.r - 7;
                        const dc = w2.c - 7;
                        if (Math.abs(dr) <= 2 && Math.abs(dc) <= 2) {
                            if (dr === 0) {
                                return Math.random() < 0.5 ? { r: 8, c: 7 + dc } : { r: 6, c: 7 + dc };
                            } else if (dc === 0) {
                                return Math.random() < 0.5 ? { r: 7 + dr, c: 8 } : { r: 7 + dr, c: 6 };
                            } else if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
                                return Math.random() < 0.5 ? { r: 7 + dr, c: 7 } : { r: 7, c: 7 + dc };
                            }
                        }
                    }
                }

                // 1. 優先執行 VCF 連續衝四絕殺搜尋 (自己)
                const vcfPath = solveVCF(board, aiColor, 10, rulesEnabled); // 探測 10 步連衝
                if (vcfPath && vcfPath.length > 0) {
                    console.log("VCF Solver found win path! Steps:", vcfPath.length, vcfPath);
                    return vcfPath[0]; // 直接返回第一步絕殺
                }

                // 2. 檢查對手是否有 VCF 連續衝四絕殺。若有，優先防禦其起始落子點
                const oppVcfPath = solveVCF(board, playerColor, 10, rulesEnabled);
                if (oppVcfPath && oppVcfPath.length > 0) {
                    const defMove = oppVcfPath[0];
                    if (!(rulesEnabled && aiColor === 1 && checkForbidden(board, defMove.r, defMove.c, 1))) {
                        console.log("VCF Solver found opponent win path! Defending at:", defMove);
                        return defMove;
                    }
                }

                // 1.5 優先執行 VCT 連續威脅勝搜尋 (自己)
                const vctPath = solveVCT(board, aiColor, 8, rulesEnabled); // 探測 8 步威脅
                if (vctPath && vctPath.length > 0) {
                    console.log("VCT Solver found win path! Steps:", vctPath.length, vctPath);
                    return vctPath[0];
                }

                // 2.5 檢查對手是否有 VCT 威脅勝。若有，優先防禦其第一步
                const oppvctPath = solveVCT(board, playerColor, 6, rulesEnabled);
                if (oppvctPath && oppvctPath.length > 0) {
                    const defMove = oppvctPath[0];
                    if (!(rulesEnabled && aiColor === 1 && checkForbidden(board, defMove.r, defMove.c, 1))) {
                        console.log("VCT Solver found opponent win path! Defending at:", defMove);
                        return defMove;
                    }
                }

                // 3. 啟動迭代加深搜尋 (IDS)
                TRANSPOSITION_TABLE.clear();
                KILLER_MOVES = Array(20).fill(null); // 重置殺手步
                HISTORY_TABLE = Array.from({ length: BOARD_SIZE }, () =>
                    Array.from({ length: BOARD_SIZE }, () => [0, 0, 0])
                );
                
                startTime = Date.now();
                isSearchTimeout = false;
                nodeCount = 0;
                
                let bestMove = null;
                const hash = computeBoardHash(board);
                
                // 迭代加深，深度從 1 遞增至 8 (相當於 9 層)
                for (let depth = 1; depth <= 8; depth++) {
                    // 若時間已經消耗了 80% 以上，則不再開啟新一輪更深層的搜尋
                    if (Date.now() - startTime > timeLimit * 0.8) {
                        break;
                    }
                    
                    let currentDepthBestMove = null;
                    let maxEval = -Infinity;
                    
                    // 獲取當前置換表中最優步
                    const ttEntry = TRANSPOSITION_TABLE.get(hash);
                    const ttBestMove = ttEntry ? ttEntry.bestMove : null;
                    
                    // 候選點加權排序
                    const scoredCandidates = [];
                    for (let i = 0; i < candidates.length; i++) {
                        const pos = candidates[i];
                        if (rulesEnabled && aiColor === 1) {
                            if (checkForbidden(board, pos.r, pos.c, 1)) continue;
                        }
                        
                        let score = getImmediateScore(board, pos.r, pos.c, aiColor) + 
                                      getImmediateScore(board, pos.r, pos.c, playerColor) * 1.25;
                        
                        if (ttBestMove && ttBestMove.r === pos.r && ttBestMove.c === pos.c) {
                            score += 10000000;
                        }
                        const killer = KILLER_MOVES[depth];
                        if (killer && killer.r === pos.r && killer.c === pos.c) {
                            score += 500000;
                        }
                        
                        scoredCandidates.push({ r: pos.r, c: pos.c, score });
                    }
                    
                    if (scoredCandidates.length === 0) {
                        break;
                    }
                    
                    scoredCandidates.sort((a, b) => b.score - a.score);
                    
                    // 執行當前層的搜尋
                    for (let i = 0; i < scoredCandidates.length; i++) {
                        if (isSearchTimeout) break;
                        
                        const move = scoredCandidates[i];
                        board[move.r][move.c] = aiColor;
                        const nextHash = hash ^ ZOBRIST_TABLE[move.r][move.c][aiColor];
                        
                        // 呼叫 minimax (depth - 1 代表剩餘遞迴層數)
                        const val = minimax(board, depth - 1, -Infinity, Infinity, false, aiColor, move.r, move.c, nextHash, rulesEnabled);
                        board[move.r][move.c] = 0; // 復原
                        
                        if (val > maxEval) {
                            maxEval = val;
                            currentDepthBestMove = move;
                        }
                    }
                    
                    // 只有當前深度完整搜完且沒有超時，我們才更新最佳著法
                    if (!isSearchTimeout && currentDepthBestMove) {
                        bestMove = currentDepthBestMove;
                        console.log(`IDS Depth ${depth} completed in ${Date.now() - startTime}ms. Nodes: ${nodeCount}. BestMove: (${bestMove.r}, ${bestMove.c})`);
                        
                        if (typeof onProgress === 'function') {
                            const pvPath = getPVPath(board, aiColor, bestMove, rulesEnabled);
                            onProgress({
                                depth: depth,
                                nodes: nodeCount,
                                nps: Math.round(nodeCount / ((Date.now() - startTime + 1) / 1000)),
                                score: maxEval,
                                pv: pvPath
                            });
                        }
                    } else {
                        break; // 搜尋中斷，不再前記
                    }
                }
                
                return bestMove || scoredCandidates[0] || candidates[0];
            }

            return candidates[0];
        }
    };

    global.GomokuAI = GomokuAI;

})(typeof window !== 'undefined' ? window : self);







