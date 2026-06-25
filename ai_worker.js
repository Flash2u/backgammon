/**
 * ai_worker.js
 * 五子棋 AI 背景線程 Web Worker
 * 負責將耗時的 Minimax 搜尋與 Alpha-Beta 剪枝運算移出網頁主執行緒，確保畫面流暢。
 */

// 載入 AI 演算法核心庫
importScripts('ai.js?t=1782411649000');

self.onmessage = function(e) {
    const { board, aiColor, difficulty, rulesEnabled } = e.data;
    
    try {
        // 呼叫 GomokuAI 運算最佳落子位置，傳入 onProgress 回調傳遞即時進度
        const bestMove = self.GomokuAI.getBestMove(board, aiColor, difficulty, rulesEnabled, (progress) => {
            self.postMessage({ type: 'progress', progress });
        });
        
        // 將結果回傳給主執行緒
        self.postMessage({ bestMove });
    } catch (err) {
        console.error("AI Web Worker Error:", err);
        self.postMessage({ bestMove: null, error: err.toString() });
    }
};













