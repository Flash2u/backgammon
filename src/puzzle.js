/**
 * puzzle.js
 * 經典殘局闖關模式關卡資料與控制
 */

export const PUZZLES = [
    {
        id: 1,
        name: "第一關：一步成五",
        desc: "黑棋已有活四，看準致勝點，一步成五！",
        limit: 1,
        playerColor: 1,
        black: [[7, 5], [7, 6], [7, 7], [7, 8]],
        white: [[6, 5], [6, 6], [6, 7]]
    },
    {
        id: 2,
        name: "第二關：雙活三絕殺",
        desc: "在關鍵點落子，同時形成兩個活三（雙三），讓對手無法阻擋下回合的活四！",
        limit: 2,
        playerColor: 1,
        black: [[7, 7], [7, 8], [8, 6], [9, 6]],
        white: [[6, 8], [9, 8], [8, 5]]
    },
    {
        id: 3,
        name: "第三關：三手衝四勝",
        desc: "先發動衝四，迫使 AI 防禦，下一手立即完成五連子！",
        limit: 2,
        playerColor: 1,
        black: [[5, 7], [6, 7], [7, 7], [8, 9], [9, 10]],
        white: [[4, 7], [9, 7], [7, 9]]
    },
    {
        id: 4,
        name: "第四關：四手連衝勝 (VCF 2步)",
        desc: "連續進行衝四，每一步都必須是進攻，不給 AI 任何反擊機會，直至成五！",
        limit: 3,
        playerColor: 1,
        black: [[7, 5], [7, 6], [7, 7], [5, 9], [6, 9], [8, 9]],
        white: [[7, 8], [7, 4], [4, 9]]
    },
    {
        id: 5,
        name: "第五關：金蟬脫殼",
        desc: "經典的雙活三與衝四複合局，找出最速絕殺路徑！",
        limit: 3,
        playerColor: 1,
        black: [[7, 7], [8, 7], [9, 7], [6, 5], [6, 6], [6, 8]],
        white: [[6, 7], [10, 7], [6, 9]]
    },
    {
        id: 6,
        name: "第六關：梅花易數 (VCF 3步)",
        desc: "連續三次衝四，最後成五。考驗你對衝四防守點的預判！",
        limit: 4,
        playerColor: 1,
        black: [[7, 7], [8, 8], [9, 9], [7, 9], [8, 9], [9, 11], [9, 12]],
        white: [[6, 6], [10, 10], [7, 10], [9, 10]]
    },
    {
        id: 7,
        name: "第七關：白棋暗度陳倉",
        desc: "此關卡你執白棋！白棋沒有禁手限制，利用這一點完成絕殺！",
        limit: 2,
        playerColor: 2,
        black: [[6, 6], [6, 7], [6, 8], [6, 9]],
        white: [[7, 7], [8, 8], [9, 9], [7, 9]]
    },
    {
        id: 8,
        name: "第八關：防守反擊戰",
        desc: "AI 有活四威脅，你必須先擋住 AI，然後在有限步數內完成自己的絕殺！",
        limit: 3,
        playerColor: 1,
        black: [[7, 5], [7, 6], [7, 7], [8, 8], [9, 9]],
        white: [[6, 5], [6, 6], [6, 7], [6, 8]]
    },
    {
        id: 9,
        name: "第九關：九星連珠 (VCF 4步)",
        desc: "考驗超長距離的連衝，每一步都需要精確定位衝四點！",
        limit: 5,
        playerColor: 1,
        black: [[7, 7], [8, 7], [9, 7], [5, 5], [6, 6], [9, 9], [10, 10]],
        white: [[6, 7], [10, 7], [4, 4], [11, 11]]
    },
    {
        id: 10,
        name: "第十關：十步殺一人 (VCF 5步)",
        desc: "終極殘局！連續 5 次衝四，在 AI 的銅牆鐵壁下完成最後的絕殺！",
        limit: 6,
        playerColor: 1,
        black: [[7, 7], [7, 8], [7, 9], [5, 5], [6, 6], [8, 8], [9, 9], [10, 5], [10, 6], [10, 8]],
        white: [[7, 6], [7, 10], [4, 4], [10, 10], [10, 4], [10, 9]]
    }
];

// 取得已通關關卡
export function getPuzzleProgress() {
    const progress = localStorage.getItem('gomoku_puzzle_progress');
    return progress ? JSON.parse(progress) : [];
}

// 標記關卡為已通關
export function completePuzzle(id) {
    const progress = getPuzzleProgress();
    if (!progress.includes(id)) {
        progress.push(id);
        localStorage.setItem('gomoku_puzzle_progress', JSON.stringify(progress));
    }
}
