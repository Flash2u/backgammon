import { BOARD_SIZE, game } from './game.js?t=1782020700000';
import { PUZZLES, getPuzzleProgress, completePuzzle } from './puzzle.js?t=1782020700000';

// ==========================================================================
// GomokuDB: IndexedDB 本地數據庫 (棋譜 & 自訂關卡)
// ==========================================================================
const GomokuDB = {
    db: null,
    
    open() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const request = indexedDB.open('GomokuDatabase', 1);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('sgf_records')) {
                    db.createObjectStore('sgf_records', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('custom_puzzles')) {
                    db.createObjectStore('custom_puzzles', { keyPath: 'id', autoIncrement: true });
                }
            };
            
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            
            request.onerror = (e) => {
                reject(e);
            };
        });
    },
    
    async saveRecord(title, winner, movesCount, sgf) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sgf_records', 'readwrite');
            const store = tx.objectStore('sgf_records');
            const data = {
                title,
                winner,
                movesCount,
                sgf,
                date: new Date().toLocaleDateString('zh-TW', { hour12: false })
            };
            const req = store.add(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    },
    
    async getAllRecords() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sgf_records', 'readonly');
            const store = tx.objectStore('sgf_records');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    },
    
    async deleteRecord(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sgf_records', 'readwrite');
            const store = tx.objectStore('sgf_records');
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    },

    async savePuzzle(title, startBoard, firstTurn, maxMoves) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('custom_puzzles', 'readwrite');
            const store = tx.objectStore('custom_puzzles');
            const data = {
                title,
                board: startBoard,
                firstTurn,
                maxMoves,
                date: new Date().toLocaleDateString('zh-TW', { hour12: false })
            };
            const req = store.add(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    },

    async getAllPuzzles() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('custom_puzzles', 'readonly');
            const store = tx.objectStore('custom_puzzles');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    },

    async deletePuzzle(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('custom_puzzles', 'readwrite');
            const store = tx.objectStore('custom_puzzles');
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }
};

// ==========================================================================
// WeatherSystem: 3D 天氣模擬粒子系統 (雨滴反彈、櫻花竹葉旋轉、下雪)
// ==========================================================================
class WeatherSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.active = false;
        this.theme = 'neon'; // 'neon', 'wood', 'slate'
        
        window.addEventListener('resize', () => this.resize());
    }
    
    start(theme) {
        this.theme = theme || 'neon';
        this.active = true;
        this.resize();
        this.particles = [];
    }
    
    stop() {
        this.active = false;
        this.particles = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    updateAndDraw() {
        if (!this.active) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // 粒子生成
        if (this.theme === 'neon') {
            if (Math.random() < 0.12 && this.particles.length < 150) {
                this.particles.push({
                    type: 'rain',
                    x: Math.random() * w * 1.3 - w * 0.3,
                    y: -20,
                    length: Math.random() * 25 + 15,
                    vx: Math.random() * 2 + 3,
                    vy: Math.random() * 8 + 12,
                    color: Math.random() < 0.5 ? 'rgba(0, 242, 254, ' : 'rgba(255, 0, 127, '
                });
            }
        } else if (this.theme === 'wood') {
            if (Math.random() < 0.05 && this.particles.length < 60) {
                const isSakura = Math.random() < 0.6;
                this.particles.push({
                    type: isSakura ? 'sakura' : 'bamboo',
                    x: Math.random() * w,
                    y: -20,
                    size: Math.random() * 10 + 6,
                    vx: Math.random() * 1.5 - 0.75,
                    vy: Math.random() * 1.2 + 0.8,
                    angle: Math.random() * Math.PI * 2,
                    angularSpeed: Math.random() * 0.04 - 0.02,
                    swingSpeed: Math.random() * 0.03 + 0.01,
                    swingAmplitude: Math.random() * 1.5 + 0.5,
                    time: Math.random() * 100
                });
            }
        } else {
            if (Math.random() < 0.2 && this.particles.length < 200) {
                this.particles.push({
                    type: 'snow',
                    x: Math.random() * w,
                    y: -10,
                    size: Math.random() * 2.5 + 0.8,
                    vx: Math.random() * 0.5 - 0.25,
                    vy: Math.random() * 0.6 + 0.5,
                    opacity: Math.random() * 0.5 + 0.3
                });
            }
        }
        
        // 獲取棋盤位置用於雨滴彈開
        const boardDom = document.getElementById('gomoku-board');
        let boardRect = null;
        if (boardDom) {
            boardRect = boardDom.getBoundingClientRect();
        }
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            if (p.type === 'rain') {
                p.x += p.vx;
                p.y += p.vy;
                
                let hitBoard = false;
                if (boardRect && p.x >= boardRect.left && p.x <= boardRect.right) {
                    const boardY = boardRect.top + boardRect.height * 0.55;
                    if (p.y >= boardY && p.y - p.vy < boardY) {
                        hitBoard = true;
                        p.y = boardY;
                    }
                }
                
                if (hitBoard) {
                    const sparkCount = Math.floor(Math.random() * 3) + 3;
                    for (let j = 0; j < sparkCount; j++) {
                        this.particles.push({
                            type: 'spark',
                            x: p.x,
                            y: p.y,
                            vx: Math.random() * 4 - 2 + p.vx * 0.2,
                            vy: -(Math.random() * 3 + 2),
                            size: Math.random() * 2 + 1,
                            life: 1.0,
                            decay: Math.random() * 0.05 + 0.05,
                            color: p.color
                        });
                    }
                    this.particles.splice(i, 1);
                } else if (p.y > h || p.x > w) {
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p.x - p.vx * 0.8, p.y - p.vy * 0.8);
                    this.ctx.lineWidth = 1.5;
                    this.ctx.strokeStyle = p.color + '0.4)';
                    this.ctx.stroke();
                }
            } else if (p.type === 'spark') {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.15;
                p.life -= p.decay;
                
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    this.ctx.fillStyle = p.color + p.life + ')';
                    this.ctx.fill();
                }
            } else if (p.type === 'sakura' || p.type === 'bamboo') {
                p.time += p.swingSpeed;
                p.x += p.vx + Math.sin(p.time) * p.swingAmplitude * 0.5;
                p.y += p.vy;
                p.angle += p.angularSpeed;
                
                if (p.y > h || p.x < -20 || p.x > w + 20) {
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.save();
                    this.ctx.translate(p.x, p.y);
                    this.ctx.rotate(p.angle);
                    const flipScaleY = Math.sin(p.time * 2);
                    this.ctx.scale(1, flipScaleY);
                    
                    this.ctx.beginPath();
                    if (p.type === 'sakura') {
                        this.ctx.fillStyle = 'rgba(255, 183, 197, 0.7)';
                        this.ctx.moveTo(0, 0);
                        this.ctx.bezierCurveTo(-p.size, -p.size/2, -p.size/2, -p.size, 0, -p.size);
                        this.ctx.bezierCurveTo(p.size/2, -p.size, p.size, -p.size/2, 0, 0);
                    } else {
                        this.ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
                        this.ctx.moveTo(0, -p.size * 1.5);
                        this.ctx.quadraticCurveTo(-p.size * 0.4, 0, 0, p.size * 1.5);
                        this.ctx.quadraticCurveTo(p.size * 0.4, 0, 0, -p.size * 1.5);
                    }
                    this.ctx.fill();
                    this.ctx.restore();
                }
            } else if (p.type === 'snow') {
                p.x += p.vx + Math.sin(p.y * 0.01) * 0.2;
                p.y += p.vy;
                
                if (p.y > h || p.x < -10 || p.x > w + 10) {
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
                    this.ctx.fill();
                }
            }
        }
    }
}

// ==========================================================================
// CelebrationSystem: 獲勝 3D 物理紙屑與霓虹煙火
// ==========================================================================
class CelebrationSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.active = false;
        this.fireworkTimer = null;
        
        window.addEventListener('resize', () => this.resize());
    }
    
    start() {
        this.active = true;
        this.resize();
        this.particles = [];
        
        const confettiCount = 100;
        const colors = ['#ff2e63', '#00f2fe', '#00ff87', '#fff717', '#ff007f', '#39ff14', '#f59e0b'];
        
        for (let i = 0; i < confettiCount; i++) {
            const side = Math.random() < 0.5 ? 'left' : 'right';
            const startX = side === 'left' ? 40 : this.canvas.width - 40;
            const startY = this.canvas.height - 20;
            const angle = side === 'left' 
                ? -(Math.random() * 45 + 30) * Math.PI / 180 
                : -(Math.random() * 45 + 105) * Math.PI / 180;
            const speed = Math.random() * 12 + 9;
            
            this.particles.push({
                type: 'confetti',
                x: startX,
                y: startY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: colors[Math.floor(Math.random() * colors.length)],
                sizeW: Math.random() * 10 + 6,
                sizeH: Math.random() * 6 + 4,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: Math.random() * 0.2 - 0.1,
                g: 0.18,
                drag: 0.985
            });
        }
        
        if (this.fireworkTimer) clearInterval(this.fireworkTimer);
        this.fireworkTimer = setInterval(() => {
            if (this.active) this.launchFirework();
        }, 1300);
        
        this.launchFirework();
        setTimeout(() => this.launchFirework(), 500);
    }
    
    stop() {
        this.active = false;
        if (this.fireworkTimer) {
            clearInterval(this.fireworkTimer);
            this.fireworkTimer = null;
        }
        this.particles = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    launchFirework() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const startX = Math.random() * w * 0.6 + w * 0.2;
        const startY = h;
        const targetY = Math.random() * h * 0.35 + h * 0.15;
        const vy = -Math.sqrt(2 * 0.12 * (h - targetY));
        const colors = ['#ff2e63', '#00f2fe', '#00ff87', '#fff717', '#ff007f', '#39ff14', '#f900ff'];
        
        this.particles.push({
            type: 'rocket',
            x: startX,
            y: startY,
            vx: Math.random() * 2 - 1,
            vy: vy,
            color: colors[Math.floor(Math.random() * colors.length)],
            g: 0.12,
            targetY: targetY
        });
    }
    
    explode(x, y, color) {
        const count = 50;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4.5 + 2.5;
            this.particles.push({
                type: 'sparkle',
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: color,
                size: Math.random() * 2.2 + 1.2,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.015,
                g: 0.07,
                drag: 0.98
            });
        }
    }
    
    updateAndDraw() {
        if (!this.active) return;
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            if (p.type === 'confetti') {
                p.vx *= p.drag;
                p.vy *= p.drag;
                p.vy += p.g;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;
                
                if (p.y > this.canvas.height) {
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.save();
                    this.ctx.translate(p.x, p.y);
                    this.ctx.rotate(p.rotation);
                    const distort = Math.cos(p.rotation * 1.5);
                    this.ctx.fillStyle = p.color;
                    this.ctx.fillRect(-p.sizeW/2, -p.sizeH/2, p.sizeW, p.sizeH * distort);
                    this.ctx.restore();
                }
            } else if (p.type === 'rocket') {
                p.vy += p.g;
                p.x += p.vx;
                p.y += p.vy;
                
                if (p.vy >= 0 || p.y <= p.targetY) {
                    this.explode(p.x, p.y, p.color);
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.fill();
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 0.4);
                    this.ctx.lineWidth = 1.5;
                    this.ctx.strokeStyle = p.color;
                    this.ctx.stroke();
                }
            } else if (p.type === 'sparkle') {
                p.vx *= p.drag;
                p.vy *= p.drag;
                p.vy += p.g;
                p.x += p.vx;
                p.y += p.vy;
                p.life -= p.decay;
                
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                } else {
                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    this.ctx.fillStyle = p.color;
                    this.ctx.shadowBlur = 6;
                    this.ctx.shadowColor = p.color;
                    this.ctx.fill();
                    this.ctx.restore();
                }
            }
        }
    }
}

// ==========================================================================
// ThreatLaserRenderer: 活三/衝四威脅格線雷射光流
// ==========================================================================
class ThreatLaserRenderer {
    constructor(canvas, boardDom) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.boardDom = boardDom;
        this.threats = [];
        this.animationId = null;
        this.time = 0;
        this.active = false;
        
        window.addEventListener('resize', () => this.resize());
    }
    
    start() {
        if (this.active) return;
        this.active = true;
        this.resize();
        this.animate();
    }
    
    stop() {
        this.active = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    resize() {
        const rect = this.boardDom.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }
    
    updateThreats(threats) {
        this.threats = threats;
        if (threats.some(t => t.threatLine)) {
            this.start();
        } else {
            this.stop();
        }
    }
    
    animate() {
        if (!this.active) return;
        this.time += 0.06;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const cellW = this.canvas.width / BOARD_SIZE;
        const cellH = this.canvas.height / BOARD_SIZE;
        
        this.threats.forEach(t => {
            if (!t.threatLine) return;
            const p1 = {
                x: t.threatLine.c1 * cellW + cellW / 2,
                y: t.threatLine.r1 * cellH + cellH / 2
            };
            const p2 = {
                x: t.threatLine.c2 * cellW + cellW / 2,
                y: t.threatLine.r2 * cellH + cellH / 2
            };
            
            const color = t.isFatal ? 'rgba(255, 46, 99, ' : 'rgba(0, 242, 254, ';
            
            // 繪製雷射管
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.lineWidth = 6;
            this.ctx.strokeStyle = color + '0.12)';
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.lineWidth = 1.8;
            this.ctx.strokeStyle = color + '0.6)';
            this.ctx.stroke();
            
            // 繪製能量粒子
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const ratio = (Math.sin(this.time * 2) + 1) / 2;
            const bx = p1.x + dx * ratio;
            const by = p1.y + dy * ratio;
            
            this.ctx.save();
            const grad = this.ctx.createRadialGradient(bx, by, 1, bx, by, 10);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, color + '1)');
            grad.addColorStop(1, color + '0)');
            
            this.ctx.beginPath();
            this.ctx.arc(bx, by, 10, 0, Math.PI * 2);
            this.ctx.fillStyle = grad;
            this.ctx.fill();
            this.ctx.restore();
            
            // 粒子尾跡
            for (let i = 0; i < 4; i++) {
                const trailRatio = ratio - (i * 0.04 * (Math.sin(this.time * 2) > 0 ? 1 : -1));
                const clamped = Math.max(0, Math.min(1, trailRatio));
                const tx = p1.x + dx * clamped;
                const ty = p1.y + dy * clamped;
                this.ctx.beginPath();
                this.ctx.arc(tx, ty, 2 * (1 - i / 4), 0, Math.PI * 2);
                this.ctx.fillStyle = color + (0.4 * (1 - i / 4)) + ')';
                this.ctx.fill();
            }
        });
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
}

// ==========================================================================
// DanmakuSystem: 旁觀者發言全螢幕彈幕系統
// ==========================================================================
class DanmakuSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.danmakus = [];
        this.lanesCount = 6;
        this.laneHeight = 36;
        this.baseY = 90;
    }
    
    addDanmaku(text, color) {
        const w = this.canvas.width;
        const lane = Math.floor(Math.random() * this.lanesCount);
        const y = this.baseY + lane * this.laneHeight;
        
        const colors = ['#00f2fe', '#ff2e63', '#00ff87', '#fff717', '#f900ff', '#ffffff'];
        const finalColor = color || colors[Math.floor(Math.random() * colors.length)];
        
        this.danmakus.push({
            text: text,
            x: w + 40,
            y: y,
            speed: Math.random() * 2 + 1.8,
            color: finalColor,
            font: "bold 18px 'Outfit', 'Inter', sans-serif"
        });
    }
    
    updateAndDraw() {
        if (this.danmakus.length === 0) return;
        
        this.ctx.save();
        this.danmakus.forEach(d => {
            d.x -= d.speed;
            this.ctx.font = d.font;
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = d.color;
            this.ctx.fillStyle = d.color;
            this.ctx.fillText(d.text, d.x, d.y);
            
            this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeText(d.text, d.x, d.y);
        });
        this.ctx.restore();
        
        this.danmakus = this.danmakus.filter(d => d.x > -350);
    }
}

export const ui = {
    state: null,
    handlers: null,
    dom: {},
    GomokuDB,

    init(gameState, eventHandlers) {
        this.state = gameState;
        this.handlers = eventHandlers;

        this.cacheDOM();
        this.createBoardGrid();
        this.bindEvents();
        this.loadSettings();

        // 實例化視覺特效與數據庫
        if (this.dom.threatCanvas) {
            this.threatLaser = new ThreatLaserRenderer(this.dom.threatCanvas, this.dom.board);
        }
        if (this.dom.screenCanvas) {
            this.weatherSystem = new WeatherSystem(this.dom.screenCanvas);
            this.celebrationSystem = new CelebrationSystem(this.dom.screenCanvas);
            this.danmakuSystem = new DanmakuSystem(this.dom.screenCanvas);
            
            const activeTheme = this.state.theme || 'neon';
            this.weatherSystem.start(activeTheme);
            
            // 啟動全屏 Canvas 動畫迴圈
            this.startScreenAnimationLoop();
        }

        // 初始化 IndexedDB
        GomokuDB.open().then(() => {
            console.log("GomokuDB initialized successfully.");
            this.renderSgfLibrary();
            this.renderPuzzleLevels(); // 同步渲染關卡
        }).catch(err => {
            console.error("GomokuDB initialization failed:", err);
        });
    },

    startScreenAnimationLoop() {
        const loop = () => {
            if (this.dom.screenCanvas && this.weatherSystem && this.danmakuSystem) {
                // 清理 Canvas 並統一重繪
                this.weatherSystem.ctx.clearRect(0, 0, this.dom.screenCanvas.width, this.dom.screenCanvas.height);
                this.weatherSystem.updateAndDraw();
                if (this.celebrationSystem && this.celebrationSystem.active) {
                    this.celebrationSystem.updateAndDraw();
                }
                this.danmakuSystem.updateAndDraw();
            }
            requestAnimationFrame(loop);
        };
        loop();
    },

    cacheDOM() {
        this.dom.board = document.getElementById('gomoku-board');
        this.dom.boardWrapper = this.dom.board.parentElement;
        this.dom.boardStartToast = document.getElementById('board-start-toast');
        this.dom.statusText = document.getElementById('status-text');
        this.dom.turnDot = document.querySelector('.turn-dot');
        this.dom.timer = document.getElementById('game-timer');
        
        this.dom.btnStart = document.getElementById('btn-start');
        this.dom.btnUndo = document.getElementById('btn-undo');
        this.dom.btnSound = document.getElementById('btn-sound');
        this.dom.soundIcon = document.getElementById('sound-icon');
        this.dom.btnClearStats = document.getElementById('btn-clear-stats');
        
        this.dom.modeButtons = document.querySelectorAll('#mode-select button');
        this.dom.difficultyButtons = document.querySelectorAll('#difficulty-select button');
        this.dom.difficultyGroup = document.getElementById('difficulty-group');
        this.dom.themeButtons = document.querySelectorAll('.theme-selector button');
        this.dom.hintButtons = document.querySelectorAll('#hint-select button');
        this.dom.rulesButtons = document.querySelectorAll('#rules-select button');
        this.dom.perspectiveButtons = document.querySelectorAll('#perspective-select button');
        this.dom.timeButtons = document.querySelectorAll('#time-select button');
        
        // Win Modal
        this.dom.winModal = document.getElementById('win-modal');
        this.dom.modalTitle = document.getElementById('modal-title');
        this.dom.modalMessage = document.getElementById('modal-message');
        this.dom.btnModalRestart = document.getElementById('btn-modal-restart');
        this.dom.btnModalClose = document.getElementById('btn-modal-close');

        // Replay/SGF Modal Buttons
        this.dom.btnModalReplay = document.getElementById('btn-modal-replay');
        this.dom.btnModalExport = document.getElementById('btn-modal-export');

        // Cards for switching
        this.dom.opsCard = document.querySelector('.ops-card');
        this.dom.puzzleCard = document.getElementById('puzzle-card');
        this.dom.puzzleLevelsList = document.getElementById('puzzle-levels-list');
        this.dom.puzzleStatusPanel = document.getElementById('puzzle-status-panel');
        this.dom.puzzleLevelTitle = document.getElementById('puzzle-level-title');
        this.dom.puzzleLevelDesc = document.getElementById('puzzle-level-desc');
        this.dom.puzzleLimitText = document.getElementById('puzzle-limit-text');
        this.dom.puzzleUsedText = document.getElementById('puzzle-used-text');

        this.dom.replayCard = document.getElementById('replay-card');
        this.dom.replayStatus = document.getElementById('replay-status');
        this.dom.btnReplayFirst = document.getElementById('btn-replay-first');
        this.dom.btnReplayPrev = document.getElementById('btn-replay-prev');
        this.dom.btnReplayNext = document.getElementById('btn-replay-next');
        this.dom.btnReplayLast = document.getElementById('btn-replay-last');
        this.dom.btnReplayExport = document.getElementById('btn-replay-export');
        this.dom.btnReplayExit = document.getElementById('btn-replay-exit');

        // P2P DOM
        this.dom.p2pCard = document.getElementById('p2p-card');
        this.dom.p2pMyId = document.getElementById('p2p-my-id');
        this.dom.p2pStatus = document.getElementById('p2p-status');
        this.dom.btnP2PInvite = document.getElementById('btn-p2p-invite');
        this.dom.btnP2PSpectate = document.getElementById('btn-p2p-spectate');
        this.dom.p2pPeerIdInput = document.getElementById('p2p-peer-id-input');
        this.dom.btnP2PConnect = document.getElementById('btn-p2p-connect');
        
        // P2P Lobby DOM
        this.dom.p2pRoomNameInput = document.getElementById('p2p-room-name-input');
        this.dom.btnP2PCreateRoom = document.getElementById('btn-p2p-create-room');
        this.dom.lobbyRoomsList = document.getElementById('lobby-rooms-list');
        this.dom.p2pVoiceGroup = document.getElementById('p2p-voice-group');
        this.dom.btnP2PVoice = document.getElementById('btn-p2p-voice');
        this.dom.p2pRemoteAudio = document.getElementById('p2p-remote-audio');
        
        // P2P Chat DOM
        this.dom.p2pChatArea = document.getElementById('p2p-chat-area');
        this.dom.chatMessages = document.getElementById('chat-messages');
        this.dom.chatInput = document.getElementById('chat-input');
        this.dom.btnSendChat = document.getElementById('btn-send-chat');

        // P2P Confirm Modal
        this.dom.p2pConfirmModal = document.getElementById('p2p-confirm-modal');
        this.dom.p2pConfirmTitle = document.getElementById('p2p-confirm-title');
        this.dom.p2pConfirmMessage = document.getElementById('p2p-confirm-message');
        this.dom.btnP2PConfirmYes = document.getElementById('btn-p2p-confirm-yes');
        this.dom.btnP2PConfirmNo = document.getElementById('btn-p2p-confirm-no');

        // About Modal
        this.dom.btnAbout = document.getElementById('btn-about');
        this.dom.aboutModal = document.getElementById('about-modal');
        this.dom.btnAboutClose = document.getElementById('btn-about-close');
        
        // AI Monitor DOM
        this.dom.aiMonitorCard = document.getElementById('ai-monitor-card');
        this.dom.aiMonitorPulse = document.getElementById('ai-monitor-pulse');
        this.dom.aiMonitorDepth = document.getElementById('ai-monitor-depth');
        this.dom.aiMonitorNodes = document.getElementById('ai-monitor-nodes');
        this.dom.aiMonitorNps = document.getElementById('ai-monitor-nps');
        this.dom.aiMonitorScore = document.getElementById('ai-monitor-score');
        this.dom.aiMonitorPv = document.getElementById('ai-monitor-pv');

        // SGF Library DOM (新增)
        this.dom.sgfLibraryCard = document.getElementById('sgf-library-card');
        this.dom.sgfList = document.getElementById('sgf-list');
        this.dom.btnSgfLibrary = document.getElementById('btn-sgf-library');
        this.dom.btnImportSgf = document.getElementById('btn-import-sgf');
        this.dom.sgfFileInput = document.getElementById('sgf-file-input');
        this.dom.btnExitSgfLib = document.getElementById('btn-exit-sgf-lib');

        // Puzzle Editor DOM (新增)
        this.dom.puzzleEditorCard = document.getElementById('puzzle-editor-card');
        this.dom.btnPuzzleEditor = document.getElementById('btn-puzzle-editor');
        this.dom.puzzleEditToolButtons = document.querySelectorAll('#puzzle-edit-tool button');
        this.dom.puzzleEditTurnButtons = document.querySelectorAll('#puzzle-edit-turn button');
        this.dom.puzzleEditMaxMoves = document.getElementById('puzzle-edit-max-moves');
        this.dom.puzzleEditTitle = document.getElementById('puzzle-edit-title');
        this.dom.btnPuzzleEditTest = document.getElementById('btn-puzzle-edit-test');
        this.dom.btnPuzzleEditSave = document.getElementById('btn-puzzle-edit-save');
        this.dom.btnPuzzleEditExit = document.getElementById('btn-puzzle-edit-exit');

        // P2P AI Hosting DOM (新增)
        this.dom.p2pHostingGroup = document.getElementById('p2p-hosting-group');
        this.dom.btnP2PHosting = document.getElementById('btn-p2p-hosting');

        // Canvases (新增)
        this.dom.threatCanvas = document.getElementById('threat-canvas');
        this.dom.screenCanvas = document.getElementById('screen-canvas');
    },

    createBoardGrid() {
        this.dom.board.innerHTML = '';
        
        // 星位坐標 (15x15 的 3, 11 行與列，還有天元 7,7)
        const stars = [
            { r: 3, c: 3 }, { r: 3, c: 11 },
            { r: 7, c: 7 },
            { r: 11, c: 3 }, { r: 11, c: 11 }
        ];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;

                // 星位
                const isStar = stars.some(star => star.r === r && star.c === c);
                if (isStar) {
                    const starDot = document.createElement('div');
                    starDot.className = 'star-point-dot';
                    cell.appendChild(starDot);
                }

                // 3D hover 預覽棋子容器
                const hoverPreview = document.createElement('div');
                hoverPreview.className = 'hover-preview';
                
                const hoverStone = document.createElement('div');
                hoverStone.className = 'stone';
                hoverPreview.appendChild(hoverStone);
                cell.appendChild(hoverPreview);

                this.dom.board.appendChild(cell);
            }
        }
    },

    bindEvents() {
        // 棋盤點擊委託與物理近鄰命中補償
        this.dom.boardWrapper.addEventListener('click', (e) => {
            if (this.state.isGameOver || this.state.isAiThinking) return;

            const cell = e.target.closest('.cell');
            if (cell) {
                const r = parseInt(cell.dataset.row);
                const c = parseInt(cell.dataset.col);
                this.handlers.onCellClick(r, c);
                return;
            }

            // Proximity 命中補償
            let minDistance = Infinity;
            let closestCell = null;
            const cells = this.dom.board.querySelectorAll('.cell');
            
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

            if (closestCell && minDistance < closestCell.offsetWidth * 1.5) {
                const r = parseInt(closestCell.dataset.row);
                const c = parseInt(closestCell.dataset.col);
                this.handlers.onCellClick(r, c);
            }
        });

        // 3D 滑鼠隨動高光反射
        this.dom.boardWrapper.addEventListener('mousemove', (e) => {
            if (this.state.viewMode !== '3d') return;
            
            const rect = this.dom.boardWrapper.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            const pctX = x / (rect.width / 2);
            const pctY = y / (rect.height / 2);
            
            this.dom.boardWrapper.style.setProperty('--light-x', pctX.toFixed(3));
            this.dom.boardWrapper.style.setProperty('--light-y', pctY.toFixed(3));
        });

        this.dom.boardWrapper.addEventListener('mouseleave', () => {
            if (this.state.viewMode !== '3d') return;
            this.dom.boardWrapper.style.setProperty('--light-x', '0');
            this.dom.boardWrapper.style.setProperty('--light-y', '0');
        });

        // 重新開始
        this.dom.btnStart.addEventListener('click', () => {
            if (this.celebrationSystem) this.celebrationSystem.stop();
            this.handlers.onRestartClick();
        });
        this.dom.btnModalRestart.addEventListener('click', () => {
            this.dom.winModal.classList.remove('active');
            if (this.celebrationSystem) this.celebrationSystem.stop();
            this.handlers.onRestartClick();
        });

        // 悔棋
        this.dom.btnUndo.addEventListener('click', () => this.handlers.onUndoClick());

        // 音效
        this.dom.btnSound.addEventListener('click', () => this.handlers.onSoundToggle());

        // 清除數據
        this.dom.btnClearStats.addEventListener('click', () => this.handlers.onClearStatsClick());

        // 關於 Modal
        this.dom.btnAbout.addEventListener('click', () => this.dom.aboutModal.classList.add('active'));
        this.dom.btnAboutClose.addEventListener('click', () => this.dom.aboutModal.classList.remove('active'));
        this.dom.aboutModal.addEventListener('click', (e) => {
            if (e.target === this.dom.aboutModal) {
                this.dom.aboutModal.classList.remove('active');
            }
        });

        this.dom.btnModalClose.addEventListener('click', () => {
            this.dom.winModal.classList.remove('active');
            if (this.celebrationSystem) this.celebrationSystem.stop();
        });

        // 匯出 SGF 棋譜 (結束 Modal)
        if (this.dom.btnModalExport) {
            this.dom.btnModalExport.addEventListener('click', () => {
                if (!this.state.moveRecord || this.state.moveRecord.length === 0) {
                    alert('目前無對局記錄，無法匯出 SGF 棋譜！');
                    return;
                }
                this.downloadSGF();
            });
        }

        // 匯出 SGF 棋譜 (復盤 Card)
        if (this.dom.btnReplayExport) {
            this.dom.btnReplayExport.addEventListener('click', () => {
                if (!this.state.moveRecord || this.state.moveRecord.length === 0) {
                    alert('目前無對局記錄，無法匯出 SGF 棋譜！');
                    return;
                }
                this.downloadSGF();
            });
        }

        // P2P 邀請複製
        this.dom.btnP2PInvite.addEventListener('click', () => this.handlers.onP2PInviteClick());

        // P2P 複製觀戰連結
        if (this.dom.btnP2PSpectate) {
            this.dom.btnP2PSpectate.addEventListener('click', () => {
                const myId = this.dom.p2pMyId.innerText;
                if (!myId || myId === '---') {
                    this.showP2PToast('⚠️ 正在取得連線 ID，請稍後...', true);
                    return;
                }
                const spectateUrl = `${window.location.origin}${window.location.pathname}?room=${myId}&spectate=1`;
                navigator.clipboard.writeText(spectateUrl).then(() => {
                    this.dom.btnP2PSpectate.innerText = '✅ 已複製觀戰連結！';
                    setTimeout(() => {
                        this.dom.btnP2PSpectate.innerText = '👁️ 複製觀戰連結';
                    }, 2000);
                }).catch(() => {
                    this.showP2PToast('⚠️ 複製連結失敗，請手動複製 ID', true);
                });
            });
        }

        // P2P 創建公開房間
        if (this.dom.btnP2PCreateRoom) {
            this.dom.btnP2PCreateRoom.addEventListener('click', () => {
                const roomName = this.dom.p2pRoomNameInput.value.trim();
                if (this.handlers.onP2PCreateRoom) {
                    this.handlers.onP2PCreateRoom(roomName);
                }
            });
        }

        // P2P 開啟語音對話
        if (this.dom.btnP2PVoice) {
            this.dom.btnP2PVoice.addEventListener('click', () => {
                if (this.handlers.onP2PVoiceToggle) {
                    this.handlers.onP2PVoiceToggle();
                }
            });
        }

        // P2P 連線
        this.dom.btnP2PConnect.addEventListener('click', () => {
            const peerId = this.dom.p2pPeerIdInput.value.trim();
            this.handlers.onP2PConnectClick(peerId);
        });

        // P2P 聊天發送
        this.dom.btnSendChat.addEventListener('click', () => {
            const text = this.dom.chatInput.value.trim();
            if (text && this.handlers.onSendChat) {
                this.handlers.onSendChat(text);
                this.dom.chatInput.value = '';
            }
        });

        this.dom.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = this.dom.chatInput.value.trim();
                if (text && this.handlers.onSendChat) {
                    this.handlers.onSendChat(text);
                    this.dom.chatInput.value = '';
                }
            }
        });

        // 表情按鈕點擊
        this.dom.p2pChatArea.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                if (emoji && this.handlers.onSendEmoji) {
                    this.handlers.onSendEmoji(emoji);
                }
            });
        });

        // 快捷字句點擊
        this.dom.p2pChatArea.querySelectorAll('.quick-msg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const msg = btn.dataset.msg;
                if (msg && this.handlers.onSendChat) {
                    this.handlers.onSendChat(msg);
                }
            });
        });

        // 模式、難度、主題、提示、規則、視角按鈕綁定
        this.bindSelectionButtons();

        // P2P AI 託管按鈕 (新增)
        if (this.dom.btnP2PHosting) {
            this.dom.btnP2PHosting.addEventListener('click', () => {
                if (this.handlers.onP2PHostingToggle) {
                    this.handlers.onP2PHostingToggle();
                }
            });
        }

        // 棋譜庫卡片按鈕 (新增)
        if (this.dom.btnSgfLibrary) {
            this.dom.btnSgfLibrary.addEventListener('click', () => {
                this.showSgfLibraryCard(true);
            });
        }
        if (this.dom.btnExitSgfLib) {
            this.dom.btnExitSgfLib.addEventListener('click', () => {
                this.showSgfLibraryCard(false);
            });
        }
        if (this.dom.btnImportSgf) {
            this.dom.btnImportSgf.addEventListener('click', () => {
                this.dom.sgfFileInput.click();
            });
        }
        if (this.dom.sgfFileInput) {
            this.dom.sgfFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importSGFFile(file);
                }
            });
        }

        // 殘局編輯器卡片按鈕 (新增)
        if (this.dom.btnPuzzleEditor) {
            this.dom.btnPuzzleEditor.addEventListener('click', () => {
                this.showPuzzleEditorCard(true);
            });
        }
        if (this.dom.btnPuzzleEditExit) {
            this.dom.btnPuzzleEditExit.addEventListener('click', () => {
                this.showPuzzleEditorCard(false);
            });
        }
        if (this.dom.btnPuzzleEditTest) {
            this.dom.btnPuzzleEditTest.addEventListener('click', () => {
                this.testCustomPuzzle();
            });
        }
        if (this.dom.btnPuzzleEditSave) {
            this.dom.btnPuzzleEditSave.addEventListener('click', () => {
                this.saveCustomPuzzle();
            });
        }
        
        // 殘局編輯工具/先手切換 (新增)
        if (this.dom.puzzleEditToolButtons) {
            this.dom.puzzleEditToolButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.dom.puzzleEditToolButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
        if (this.dom.puzzleEditTurnButtons) {
            this.dom.puzzleEditTurnButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.dom.puzzleEditTurnButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
    },

    bindSelectionButtons() {
        // 模式
        this.dom.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.handlers.onSettingChange('gameMode', mode);
            });
        });

        // 難度
        this.dom.difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const diff = btn.dataset.diff;
                this.handlers.onSettingChange('aiDifficulty', diff);
            });
        });

        // 限時
        if (this.dom.timeButtons) {
            this.dom.timeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const time = btn.dataset.time;
                    this.handlers.onSettingChange('timeLimitRule', time);
                });
            });
        }

        // 提示
        this.dom.hintButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const enabled = btn.dataset.hint === 'on';
                this.handlers.onSettingChange('hintEnabled', enabled);
            });
        });

        // 規則
        this.dom.rulesButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const rules = btn.dataset.rules;
                this.handlers.onSettingChange('rulesMode', rules);
            });
        });

        // 主題
        this.dom.themeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.setTheme(theme);
            });
        });

        // 視角
        this.dom.perspectiveButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.setPerspectiveView(view);
            });
        });
    },

    loadSettings() {
        // 從系統狀態恢復 UI 樣式
        this.setTheme(localStorage.getItem('gomoku_theme') || 'neon');
        this.setPerspectiveView(localStorage.getItem('gomoku_perspective') || '2d');
    },

    setTheme(theme) {
        document.body.classList.remove('theme-neon', 'theme-wood', 'theme-slate');
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem('gomoku_theme', theme);

        this.dom.themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });

        if (this.weatherSystem) {
            this.weatherSystem.start(theme);
        }
    },

    setPerspectiveView(view) {
        this.state.viewMode = view;
        this.dom.boardWrapper.classList.toggle('view-3d', view === '3d');
        localStorage.setItem('gomoku_perspective', view);

        this.dom.perspectiveButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
    },

    renderBoard() {
        const cells = this.dom.board.querySelectorAll('.cell');
        cells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            const color = this.state.board[r][c];

            cell.classList.remove('has-stone');
            const stone = cell.querySelector('.stone');
            if (stone && !stone.classList.contains('stone-undoing')) {
                stone.remove();
            }

            if (color !== 0) {
                cell.classList.add('has-stone');
                
                // 如果已經在播放悔棋動畫，則不要覆蓋它
                if (!cell.querySelector('.stone')) {
                    const stoneEl = document.createElement('div');
                    stoneEl.className = `stone ${color === 1 ? 'black' : 'white'}`;
                    cell.appendChild(stoneEl);
                }
            }
        });

        this.updateUndoButtonState();
    },

    renderStone(r, c, color) {
        const cell = this.dom.board.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (!cell) return;

        cell.classList.add('has-stone');
        
        // 避免重複生成
        let stone = cell.querySelector('.stone');
        if (stone) stone.remove();

        stone = document.createElement('div');
        stone.className = `stone ${color === 1 ? 'black' : 'white'}`;
        cell.appendChild(stone);

        // 3D 物理墜落微震
        if (this.state.viewMode === '3d') {
            stone.style.animation = 'placeStone3D 0.26s cubic-bezier(0.25, 1, 0.5, 1) forwards';
            
            // 棋盤震顫
            setTimeout(() => {
                this.dom.boardWrapper.classList.add('impact-shake');
                setTimeout(() => {
                    this.dom.boardWrapper.classList.remove('impact-shake');
                }, 240);
            }, 200);
        }

        // 粒子效果
        this.createPlacementParticles(cell, color);
        this.updateUndoButtonState();
    },

    createPlacementParticles(cellEl, color) {
        const rect = cellEl.getBoundingClientRect();
        const boardRect = this.dom.board.getBoundingClientRect();
        
        const centerX = rect.left - boardRect.left + rect.width / 2;
        const centerY = rect.top - boardRect.top + rect.height / 2;

        const isThemeNeon = document.body.classList.contains('theme-neon');
        const particleColor = color === 1 
            ? (isThemeNeon ? '#00f2fe' : '#1e293b') 
            : (isThemeNeon ? '#f472b6' : '#ffffff');

        const particleCount = 15 + Math.floor(Math.random() * 6); // 15~20 物理粒子
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed - 1.5; // 帶一個向上的初速度，形成優雅的拋射噴散
            
            const size = 3 + Math.random() * 4;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.background = particleColor;
            p.style.position = 'absolute';
            p.style.borderRadius = '50%';
            p.style.pointerEvents = 'none';
            p.style.zIndex = '10';
            
            if (isThemeNeon) {
                p.style.boxShadow = `0 0 6px ${particleColor}, 0 0 10px ${particleColor}`;
            }

            p.style.left = `${centerX}px`;
            p.style.top = `${centerY}px`;
            
            this.dom.board.appendChild(p);

            particles.push({
                el: p,
                x: centerX,
                y: centerY,
                vx: vx,
                vy: vy,
                alpha: 1,
                decay: 0.02 + Math.random() * 0.02
            });
        }

        const gravity = 0.12; // 重力加速度
        const friction = 0.98; // 空氣阻力阻尼

        const self = this;
        function updatePhysics() {
            let activeCount = 0;
            particles.forEach(p => {
                if (p.alpha <= 0) return;
                activeCount++;
                
                // 歐拉物理積分
                p.vx *= friction;
                p.vy = (p.vy + gravity) * friction;
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= p.decay;
                
                p.el.style.left = `${p.x}px`;
                p.el.style.top = `${p.y}px`;
                p.el.style.opacity = Math.max(0, p.alpha);
                
                if (p.alpha <= 0) {
                    p.el.remove();
                }
            });
            if (activeCount > 0) {
                requestAnimationFrame(updatePhysics);
            }
        }
        requestAnimationFrame(updatePhysics);
    },

    updateThreatHints(hints) {
        this.clearThreatHints();
        
        hints.forEach(hint => {
            const cell = this.dom.board.querySelector(`[data-row="${hint.r}"][data-col="${hint.c}"]`);
            if (cell && !cell.querySelector('.threat-ring')) {
                const ring = document.createElement('div');
                ring.className = 'threat-ring';
                
                if (hint.isFatal) {
                    ring.classList.add('threat-fatal');
                } else {
                    ring.classList.add('threat-warning');
                }
                
                if (hint.black) ring.classList.add('threat-black');
                if (hint.white) ring.classList.add('threat-white');
 
                cell.appendChild(ring);
            }
        });

        // 觸發雷射流光特效 (新增)
        if (this.threatLaser) {
            this.threatLaser.updateThreats(hints);
        }
    },
 
    clearThreatHints() {
        const rings = this.dom.board.querySelectorAll('.threat-ring');
        rings.forEach(r => r.remove());
        if (this.threatLaser) {
            this.threatLaser.stop();
        }
    },
 
    updateForbiddenMoves(forbiddenList) {
        const cells = this.dom.board.querySelectorAll('.cell');
        cells.forEach(c => {
            c.classList.remove('forbidden');
            const marker = c.querySelector('.forbidden-marker');
            if (marker) marker.remove();
        });

        forbiddenList.forEach(pos => {
            const cell = this.dom.board.querySelector(`[data-row="${pos.r}"][data-col="${pos.c}"]`);
            if (cell) {
                cell.classList.add('forbidden');
                // 只有在黑棋回合且格子為空時才常態標記淡紅色發光 ×
                if (this.state.currentTurn === 1 && !cell.classList.contains('has-stone')) {
                    const marker = document.createElement('div');
                    marker.className = 'forbidden-marker';
                    marker.innerText = '×';
                    cell.appendChild(marker);
                }
            }
        });
    },

    showForbiddenToast(type) {
        let text = '此處為黑棋禁手點！';
        if (type === 'double_three') text = '🚫 禁手：三三禁手！';
        else if (type === 'double_four') text = '🚫 禁手：四四禁手！';
        else if (type === 'overline') text = '🚫 禁手：長連禁手！';
        
        this.dom.statusText.innerText = text;
        this.dom.statusText.style.color = '#ef4444';
        
        if (window.toastTimeout) {
            clearTimeout(window.toastTimeout);
        }
        
        window.toastTimeout = setTimeout(() => {
            this.dom.statusText.style.color = '';
            this.updateTurnUI();
        }, 1500);
    },

    updateTurnUI() {
        const isP2P = this.state.gameMode === 'p2p' && this.handlers.isP2PConnected();
        let myColor = null;
        if (isP2P) {
            myColor = this.handlers.getP2PMyColor();
        }

        // 判定棋盤是否應為禁用狀態 (唯讀)
        const isBoardDisabled = this.state.isGameOver || 
                                this.state.isAiThinking || 
                                (this.state.gameMode === 'p2p' && (!this.handlers.isP2PConnected() || this.state.currentTurn !== myColor)) ||
                                (this.state.gameMode === 'ai' && this.state.currentTurn !== this.state.playerColor) ||
                                this.state.isReplayMode;

        this.dom.board.classList.toggle('board-disabled', !!isBoardDisabled);

        if (this.state.isGameOver) return;

        const turnDotColor = this.state.currentTurn === 1 
            ? 'var(--accent-primary)' 
            : 'var(--accent-secondary)';

        this.dom.turnDot.style.background = turnDotColor;
        
        if (this.state.gameMode === 'p2p') {
            if (isP2P) {
                if (this.state.currentTurn === myColor) {
                    this.dom.statusText.innerText = '您的回合 (請落子)';
                    this.dom.statusText.style.color = 'var(--accent-primary)';
                } else {
                    this.dom.statusText.innerText = '等待對手落子...';
                    this.dom.statusText.style.color = 'var(--text-secondary)';
                }
            } else {
                // 如果目前是客方且正在嘗試連線中，顯示「連線房主中，請稍後...」
                const isConnecting = (window.p2p && window.p2p.getMyColor() === 2);
                if (isConnecting) {
                    this.dom.statusText.innerText = '連線房主中，請稍後...';
                    this.dom.statusText.style.color = 'var(--text-secondary)';
                } else {
                    this.dom.statusText.innerText = '等待對手連線...';
                    this.dom.statusText.style.color = 'var(--accent-primary)';
                }
            }
        } else {
            if (this.state.gameMode === 'ai') {
                if (this.state.currentTurn === this.state.playerColor) {
                    this.dom.statusText.innerText = '您的回合 (請落子)';
                    this.dom.statusText.style.color = 'var(--accent-primary)';
                } else {
                    this.dom.statusText.innerText = 'AI 思考中...';
                    this.dom.statusText.style.color = 'var(--accent-secondary)';
                }
            } else {
                this.dom.statusText.innerText = `${this.state.currentTurn === 1 ? '黑棋' : '白棋'}的回合`;
                this.dom.statusText.style.color = 'var(--text-primary)';
            }
        }
    },

    updateTimerUI(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        this.dom.timer.innerText = `${m}:${s}`;
    },

    updateStatsUI(stats) {
        const p1Label = document.getElementById('player1-label');
        const p2Label = document.getElementById('player2-label');
        const p1Wins = document.getElementById('stat-p1-wins');
        const p2Wins = document.getElementById('stat-p2-wins');
        const draws = document.getElementById('stat-draws');

        if (this.state.gameMode === 'ai') {
            if (p1Label) p1Label.innerText = '玩家勝';
            if (p2Label) p2Label.innerText = 'AI勝';
            if (p1Wins) p1Wins.innerText = stats.playerWins;
            if (p2Wins) p2Wins.innerText = stats.aiWins;
        } else {
            if (p1Label) p1Label.innerText = '黑棋勝';
            if (p2Label) p2Label.innerText = '白棋勝';
            if (p1Wins) p1Wins.innerText = stats.pvpBlackWins;
            if (p2Wins) p2Wins.innerText = stats.pvpWhiteWins;
        }
        if (draws) draws.innerText = stats.draws;
    },

    updateUndoButtonState() {
        const isP2P = this.state.gameMode === 'p2p' && this.handlers.isP2PConnected();
        this.dom.btnUndo.disabled = this.state.isGameOver || this.state.history.length === 0 || this.state.isAiThinking || (isP2P && this.state.currentTurn !== this.handlers.getP2PMyColor());
    },

    setSoundButtonUI(enabled) {
        if (enabled) {
            this.dom.soundIcon.innerText = '🔊';
            this.dom.btnSound.innerHTML = '<span class="btn-icon" id="sound-icon">🔊</span> 音效: 開';
        } else {
            this.dom.soundIcon.innerText = '🔇';
            this.dom.btnSound.innerHTML = '<span class="btn-icon" id="sound-icon">🔇</span> 音效: 關';
        }
        // 重新緩存 soundIcon
        this.dom.soundIcon = document.getElementById('sound-icon');
    },

    setP2PStatus(status, color = '') {
        this.dom.p2pStatus.innerText = status;
        this.dom.p2pStatus.style.color = color;
        this.updateChatAreaVisibility();
    },

    updateChatAreaVisibility() {
        if (this.state.gameMode === 'p2p' && this.handlers.isP2PConnected()) {
            this.dom.p2pChatArea.style.display = 'flex';
        } else {
            this.dom.p2pChatArea.style.display = 'none';
        }
    },

    appendChatMessage(sender, text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${type || ''}`;
        
        const senderSpan = document.createElement('span');
        senderSpan.className = 'msg-sender';
        senderSpan.innerText = `${sender}: `;
        
        const textNode = document.createTextNode(text);
        
        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(textNode);
        
        this.dom.chatMessages.appendChild(msgDiv);
        this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
    },

    showFloatingEmoji(emoji) {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'floating-emoji';
        emojiDiv.innerText = emoji;
        
        this.dom.boardWrapper.appendChild(emojiDiv);
        
        setTimeout(() => {
            emojiDiv.remove();
        }, 2000);
    },

    showP2PToast(message, isAlert = false) {
        this.dom.statusText.innerText = message;
        this.dom.statusText.style.color = isAlert ? '#ef4444' : 'var(--accent-secondary)';
        
        if (window.p2pToastTimeout) {
            clearTimeout(window.p2pToastTimeout);
        }
        
        window.p2pToastTimeout = setTimeout(() => {
            this.dom.statusText.style.color = '';
            this.updateTurnUI();
        }, 3000);
    },

    setP2PMyId(id) {
        this.dom.p2pMyId.innerText = id;
    },

    showP2PConfirmModal(title, msg, onYes, onNo) {
        this.dom.p2pConfirmTitle.innerText = title;
        this.dom.p2pConfirmMessage.innerText = msg;
        this.dom.p2pConfirmModal.classList.add('active');

        // 重新綁定 P2P 同意與拒絕事件
        const newYes = this.dom.btnP2PConfirmYes.cloneNode(true);
        const newNo = this.dom.btnP2PConfirmNo.cloneNode(true);
        this.dom.btnP2PConfirmYes.parentNode.replaceChild(newYes, this.dom.btnP2PConfirmYes);
        this.dom.btnP2PConfirmNo.parentNode.replaceChild(newNo, this.dom.btnP2PConfirmNo);
        this.dom.btnP2PConfirmYes = newYes;
        this.dom.btnP2PConfirmNo = newNo;

        this.dom.btnP2PConfirmYes.addEventListener('click', () => {
            this.hideP2PConfirmModal();
            onYes();
        });

        this.dom.btnP2PConfirmNo.addEventListener('click', () => {
            this.hideP2PConfirmModal();
            onNo();
        });
    },

    hideP2PConfirmModal() {
        this.dom.p2pConfirmModal.classList.remove('active');
    },

    showGameEndModal(winner, winningStones, isTimeout = false) {
        let titleText = '';
        let msgText = '';

        if (winner === 0) {
            titleText = '平局！';
            msgText = '棋盤已滿，雙方勢均力敵！';
        } else {
            // 高亮獲勝棋子
            winningStones.forEach(pos => {
                const cell = this.dom.board.querySelector(`[data-row="${pos.r}"][data-col="${pos.c}"]`);
                if (cell) {
                    const stone = cell.querySelector('.stone');
                    if (stone) stone.classList.add('winning-stone');
                }
            });

            if (this.state.gameMode === 'ai') {
                if (winner === this.state.playerColor) {
                    titleText = '🎉 恭喜獲勝！';
                    msgText = `您成功擊敗了 [${this.getDiffName(this.state.aiDifficulty)}] AI！\n【 贏家：您 (玩家) ｜ 輸家：AI 】`;
                } else {
                    titleText = '💀 遺憾落敗...';
                    msgText = `您被 [${this.getDiffName(this.state.aiDifficulty)}] AI 擊敗了，再接再厲！\n【 贏家：AI ｜ 輸家：您 (玩家) 】`;
                }
            } else if (this.state.gameMode === 'puzzle') {
                if (winner === this.state.playerColor) {
                    titleText = '🎉 殘局挑戰成功！';
                    msgText = `恭喜您在限制步數內成功破解了此殘局！`;
                    
                    // 如果是內建關卡 (ID 是數值)，解鎖下一關
                    if (typeof this.state.currentPuzzleId === 'number') {
                        completePuzzle(this.state.currentPuzzleId);
                    }
                    this.renderPuzzleLevels();
                } else {
                    titleText = '❌ 殘局挑戰失敗';
                    msgText = `很遺憾，您沒有成功破解此殘局，請再接再厲！`;
                }
            } else {
                titleText = '🏆 棋局已分！';
                const winnerName = winner === 1 ? '先手黑棋' : '後手白棋';
                const loserName = winner === 1 ? '後手白棋' : '先手黑棋';
                msgText = `恭喜 ${winnerName} 贏得本場勝利！\n【 贏家：${winnerName} ｜ 輸家：${loserName} 】`;
            }

            if (isTimeout) {
                msgText += '\n(因玩家思考超時判定)';
            }
        }

        // 獲勝時啟動 3D 慶典動畫
        if (winner !== 0 && this.celebrationSystem) {
            this.celebrationSystem.start();
        }

        // 自動儲存至 IndexedDB 本地棋譜庫
        if (this.state.gameMode !== 'puzzle' && typeof game !== 'undefined' && game.exportToSGF && this.state.history && this.state.history.length > 0) {
            const sgfContent = game.exportToSGF();
            const dateStr = new Date().toLocaleDateString('zh-TW');
            const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
            
            let oppName = "AI";
            if (this.state.gameMode === 'p2p') {
                oppName = "遠端玩家";
            } else if (this.state.gameMode === 'pvp') {
                oppName = "本地雙人";
            }
            
            let myName = "我";
            if (this.state.gameMode === 'pvp') {
                myName = "玩家1";
                oppName = "玩家2";
            }
            
            let winnerName = "平局";
            if (winner === 1) {
                winnerName = "黑勝";
            } else if (winner === 2) {
                winnerName = "白勝";
            }
            
            const title = `${this.state.gameMode.toUpperCase()}_對局_${dateStr}_${timeStr} (${winnerName})`;
            const movesCount = this.state.history.length;
            
            GomokuDB.saveRecord(title, winner, movesCount, sgfContent)
                .then(() => {
                    console.log("Automatically saved game to local database.");
                    this.renderSgfLibrary(); // 重新渲染棋譜列表
                })
                .catch(e => console.error("Auto-save game failed:", e));
        }

        this.dom.modalTitle.innerText = titleText;
        this.dom.modalMessage.innerText = msgText;
        this.dom.winModal.classList.add('active');
        this.dom.btnUndo.disabled = true;
    },

    showBoardStartToast(text) {
        if (!this.dom.boardStartToast) return;
        this.dom.boardStartToast.innerText = text;
        this.dom.boardStartToast.classList.remove('fade-out');
        this.dom.boardStartToast.style.display = 'block';

        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.toastTimer = setTimeout(() => {
            this.hideBoardStartToast();
        }, 5000);
    },

    hideBoardStartToast() {
        if (!this.dom.boardStartToast) return;
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        this.dom.boardStartToast.classList.add('fade-out');
        setTimeout(() => {
            if (this.dom.boardStartToast.classList.contains('fade-out')) {
                this.dom.boardStartToast.style.display = 'none';
            }
        }, 500);
    },

    getDiffName(diff) {
        switch(diff) {
            case 'easy': return '簡單';
            case 'medium': return '中等';
            case 'hard': return '困難';
            default: return '未知';
        }
    },

    updateSettingButtons(name, value) {
        if (name === 'gameMode') {
            this.dom.modeButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === value);
            });
            this.dom.difficultyGroup.style.display = value === 'ai' ? 'block' : 'none';
            this.dom.p2pCard.style.display = value === 'p2p' ? 'block' : 'none';
            
            // 當前是 AI 模式且是困難難度，顯示 AI 監控面板，否則隱藏
            this.showAIMonitor(value === 'ai' && this.state.aiDifficulty === 'hard');
            this.updateChatAreaVisibility();
        } else if (name === 'aiDifficulty') {
            this.dom.difficultyButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.diff === value);
            });
            this.showAIMonitor(this.state.gameMode === 'ai' && value === 'hard');
        } else if (name === 'hintEnabled') {
            this.dom.hintButtons.forEach(btn => {
                const isBtnOn = btn.dataset.hint === 'on';
                btn.classList.toggle('active', isBtnOn === value);
            });
        } else if (name === 'rulesMode') {
            this.dom.rulesButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.rules === value);
            });
        } else if (name === 'timeLimitRule') {
            if (this.dom.timeButtons) {
                this.dom.timeButtons.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.time === value);
                });
            }
        }
    },

    animateUndoStone(r, c, onComplete) {
        const cell = this.dom.board.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (cell) {
            const stone = cell.querySelector('.stone');
            if (stone) {
                stone.classList.add('stone-undoing');
                setTimeout(() => {
                    stone.remove();
                    cell.classList.remove('has-stone');
                    onComplete();
                }, 350);
            } else {
                onComplete();
            }
        } else {
            onComplete();
        }
    },

    // ==========================================================================
    // 大廳房間列表渲染 (v2.0.0)
    // ==========================================================================
    renderLobbyRooms(rooms, error = null) {
        if (!this.dom.lobbyRoomsList) return;
        
        if (error) {
            this.dom.lobbyRoomsList.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'text-align: center; padding: 16px 12px; color: var(--text-muted); font-size: 0.85rem; font-weight: 400; display: flex; flex-direction: column; align-items: center; gap: 10px; line-height: 1.5;';
            errorDiv.innerHTML = `
                <span>📢 公共大廳已離線。您可以複製上方邀請連結發送給好友，或手動輸入對手 ID 連線對戰。</span>
                <button id="btn-lobby-retry" class="lobby-room-btn" style="padding: 6px 16px; font-size: 0.8rem; background: var(--accent-primary); border-radius: 4px; border: none; color: white; cursor: pointer; transition: all 0.3s; box-shadow: 0 0 8px rgba(0, 242, 254, 0.3);">手動重連大廳</button>
            `;
            this.dom.lobbyRoomsList.appendChild(errorDiv);
            
            const retryBtn = errorDiv.querySelector('#btn-lobby-retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    retryBtn.disabled = true;
                    retryBtn.innerText = '連線中...';
                    if (window.p2p && window.p2p.resetLobbyRetry) {
                        window.p2p.resetLobbyRetry();
                    }
                });
            }
            return;
        }
        
        this.dom.lobbyRoomsList.innerHTML = '';
        if (!rooms) rooms = [];
        
        // 過濾掉自己的 Peer ID
        const myId = this.dom.p2pMyId ? this.dom.p2pMyId.innerText : '---';
        const availableRooms = rooms.filter(room => room.id !== myId);
        
        if (availableRooms.length === 0) {
            this.dom.lobbyRoomsList.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-muted);">目前無等待中的公開房間</div>';
            return;
        }
        
        availableRooms.forEach(room => {
            const item = document.createElement('div');
            item.className = 'lobby-room-item';
            
            const info = document.createElement('div');
            info.className = 'lobby-room-info';
            info.innerHTML = `<span class="lobby-room-name" style="font-weight:600; color:var(--text-primary);">${room.name}</span><span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px;">(${room.rulesMode === 'renju' ? '禁手' : '標準'})</span>`;
            
            const btn = document.createElement('button');
            btn.className = 'lobby-room-btn';
            btn.innerText = '一鍵配對';
            
            btn.addEventListener('click', () => {
                this.handlers.onP2PConnectClick(room.id);
            });
            
            item.appendChild(info);
            item.appendChild(btn);
            this.dom.lobbyRoomsList.appendChild(item);
        });
    },

    downloadSGF() {
        if (typeof game === 'undefined' || !game.exportToSGF) {
            console.error("Game core or exportToSGF is not loaded");
            return;
        }
        const sgfContent = game.exportToSGF();
        const blob = new Blob([sgfContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // 取得當前時間字串做為檔名一部分
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const dateStr = `${year}${month}${date}_${hours}${minutes}`;
        
        a.href = url;
        a.download = `CyberGomoku_${dateStr}.sgf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // ==========================================================================
    // WebRTC 語音通話狀態更新 (v2.0.0)
    // ==========================================================================
    setVoiceUIActive(active, isCalling = false) {
        if (!this.dom.btnP2PVoice) return;
        if (active) {
            this.dom.btnP2PVoice.classList.add('active');
            this.dom.btnP2PVoice.innerHTML = '<span class="btn-icon">🎙️</span> 語音通話中 (點擊關閉)';
            this.dom.btnP2PVoice.style.background = 'var(--accent-secondary)';
            this.dom.btnP2PVoice.style.color = '#fff';
        } else {
            this.dom.btnP2PVoice.classList.remove('active');
            this.dom.btnP2PVoice.innerHTML = `<span class="btn-icon">🎙️</span> ${isCalling ? '正在連線中...' : '開啟語音對話'}`;
            this.dom.btnP2PVoice.style.background = '';
            this.dom.btnP2PVoice.style.color = '';
        }
    },

    // ==========================================================================
    // AI 思考可視化終端 (v2.0.0)
    // ==========================================================================
    showAIMonitor(show) {
        if (!this.dom.aiMonitorCard) return;
        this.dom.aiMonitorCard.style.display = show ? 'block' : 'none';
        if (this.dom.aiMonitorPulse) {
            this.dom.aiMonitorPulse.style.display = show ? 'inline-block' : 'none';
        }
        if (!show) {
            this.clearVirtualAIStones();
        }
    },

    updateAIMonitor(progress) {
        if (!this.dom.aiMonitorCard || this.dom.aiMonitorCard.style.display === 'none') return;
        
        if (this.dom.aiMonitorDepth) {
            this.dom.aiMonitorDepth.innerText = `迭代深度: ${progress.depth} 層`;
        }
        if (this.dom.aiMonitorNodes) {
            this.dom.aiMonitorNodes.innerText = `計算節點: ${progress.nodes} 個`;
        }
        if (this.dom.aiMonitorNps) {
            this.dom.aiMonitorNps.innerText = `每秒算力: ${progress.nps} NPS`;
        }
        if (this.dom.aiMonitorScore) {
            const scoreVal = progress.score;
            let scoreText = scoreVal.toString();
            if (scoreVal > 50000000) scoreText = 'AI 必勝 👑';
            else if (scoreVal < -50000000) scoreText = '玩家必勝 👑';
            this.dom.aiMonitorScore.innerText = `局勢估分: ${scoreText}`;
        }
        if (this.dom.aiMonitorPv) {
            if (progress.pv && progress.pv.length > 0) {
                const movesStr = progress.pv.map(m => `(${m.r},${m.c})`).join(' ➜ ');
                this.dom.aiMonitorPv.innerText = `預測路徑: ${movesStr}`;
                // 在棋盤上繪製虛擬預覽子
                this.renderVirtualAIStones(progress.pv);
            } else {
                this.dom.aiMonitorPv.innerText = '預測路徑: -';
            }
        }
    },

    renderVirtualAIStones(pv) {
        this.clearVirtualAIStones();
        if (!pv || pv.length === 0) return;
        
        const aiColor = 3 - this.state.playerColor; // AI 的顏色
        pv.forEach((move, index) => {
            const cell = this.dom.board.querySelector(`[data-row="${move.r}"][data-col="${move.c}"]`);
            if (cell && !cell.classList.contains('has-stone')) {
                const vStone = document.createElement('div');
                // 動態輪流黑白預覽
                const color = (index % 2 === 0) ? aiColor : (3 - aiColor);
                vStone.className = `stone virtual-stone ${color === 1 ? 'black' : 'white'}`;
                
                // 加上半透明及發光樣式
                vStone.style.opacity = '0.35';
                vStone.style.boxShadow = 'none';
                vStone.style.pointerEvents = 'none';
                vStone.style.zIndex = '4';
                
                // 標註順序數字
                const number = document.createElement('div');
                number.style.fontSize = '10px';
                number.style.fontWeight = 'bold';
                number.style.color = color === 1 ? '#fff' : '#000';
                number.innerText = index + 1;
                vStone.appendChild(number);
                
                cell.appendChild(vStone);
            }
        });
    },

    clearVirtualAIStones() {
        const vStones = this.dom.board.querySelectorAll('.virtual-stone');
        vStones.forEach(s => s.remove());
    },

    // ==========================================================================
    // SGF Library & Puzzle Editor Controllers (新增)
    // ==========================================================================
    showSgfLibraryCard(show) {
        if (!this.dom.sgfLibraryCard) return;
        this.dom.sgfLibraryCard.style.display = show ? 'block' : 'none';
        if (show) {
            this.dom.opsCard.style.display = 'none';
            this.dom.p2pCard.style.display = 'none';
            this.dom.puzzleCard.style.display = 'none';
            this.dom.replayCard.style.display = 'none';
            if (this.dom.puzzleEditorCard) this.dom.puzzleEditorCard.style.display = 'none';
            this.renderSgfLibrary();
        } else {
            const mode = this.state.gameMode;
            this.dom.opsCard.style.display = (mode === 'ai' || mode === 'pvp') ? 'block' : 'none';
            this.dom.p2pCard.style.display = mode === 'p2p' ? 'block' : 'none';
            this.dom.puzzleCard.style.display = mode === 'puzzle' ? 'block' : 'none';
        }
    },

    showPuzzleEditorCard(show) {
        if (!this.dom.puzzleEditorCard) return;
        this.isPuzzleEditing = show;
        this.dom.puzzleEditorCard.style.display = show ? 'block' : 'none';
        if (show) {
            this.dom.opsCard.style.display = 'none';
            this.dom.p2pCard.style.display = 'none';
            this.dom.puzzleCard.style.display = 'none';
            this.dom.replayCard.style.display = 'none';
            this.dom.sgfLibraryCard.style.display = 'none';
            
            // 清空棋盤準備自訂編輯
            game.reset();
            this.renderBoard();
            this.showP2PToast("🛠️ 進入殘局編輯模式，可點擊棋盤擺放棋子");
        } else {
            const mode = this.state.gameMode;
            this.dom.opsCard.style.display = (mode === 'ai' || mode === 'pvp') ? 'block' : 'none';
            this.dom.p2pCard.style.display = mode === 'p2p' ? 'block' : 'none';
            this.dom.puzzleCard.style.display = mode === 'puzzle' ? 'block' : 'none';
            game.reset();
            this.renderBoard();
        }
    },

    renderSgfLibrary() {
        if (!this.dom.sgfList) return;
        this.dom.sgfList.innerHTML = '';
        
        GomokuDB.getAllRecords().then(records => {
            if (records.length === 0) {
                this.dom.sgfList.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 0.8rem;">目前無儲存的本地棋譜</div>';
                return;
            }
            
            records.reverse().forEach(rec => {
                const item = document.createElement('div');
                item.className = 'sgf-item';
                
                const title = document.createElement('div');
                title.className = 'sgf-item-title';
                title.innerText = rec.title || '未命名棋譜';
                
                const meta = document.createElement('div');
                meta.className = 'sgf-item-meta';
                
                const winnerText = rec.winner === 1 ? '黑勝' : (rec.winner === 2 ? '白勝' : '平局');
                meta.innerHTML = `<span>📅 ${rec.date}</span><span>${winnerText} (${rec.movesCount}手)</span>`;
                
                item.appendChild(title);
                item.appendChild(meta);
                
                const actionRow = document.createElement('div');
                actionRow.style.display = 'flex';
                actionRow.style.gap = '8px';
                actionRow.style.marginTop = '8px';
                
                const btnLoad = document.createElement('button');
                btnLoad.className = 'btn-primary';
                btnLoad.style.flex = '1';
                btnLoad.style.fontSize = '0.75rem';
                btnLoad.style.padding = '4px 0';
                btnLoad.style.marginTop = '0';
                btnLoad.innerText = '🔍 載入復盤';
                btnLoad.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadSGFForReplay(rec.sgf);
                    this.showSgfLibraryCard(false);
                });
                
                const btnDel = document.createElement('button');
                btnDel.className = 'btn-secondary';
                btnDel.style.fontSize = '0.75rem';
                btnDel.style.padding = '4px 8px';
                btnDel.style.marginTop = '0';
                btnDel.innerText = '🗑️';
                btnDel.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`確定要刪除棋譜「${rec.title}」嗎？`)) {
                       GomokuDB.deleteRecord(rec.id).then(() => {
                           this.renderSgfLibrary();
                       });
                    }
                });
                
                actionRow.appendChild(btnLoad);
                actionRow.appendChild(btnDel);
                item.appendChild(actionRow);
                
                this.dom.sgfList.appendChild(item);
            });
        });
    },

    renderPuzzleLevels() {
        if (!this.dom.puzzleLevelsList) return;
        this.dom.puzzleLevelsList.innerHTML = '';
        
        const completedList = getPuzzleProgress();
        
        PUZZLES.forEach(level => {
            const isUnlocked = level.id === 1 || completedList.includes(level.id - 1);
            const isCompleted = completedList.includes(level.id);
            
            const item = document.createElement('div');
            item.className = `puzzle-level-item ${isCompleted ? 'completed' : ''} ${!isUnlocked ? 'locked' : ''}`;
            if (this.state.currentPuzzleId === level.id && this.state.gameMode === 'puzzle') {
                item.classList.add('active');
            }
            
            const name = document.createElement('div');
            name.className = 'puzzle-level-name';
            name.innerText = level.name;
            
            const status = document.createElement('div');
            status.className = 'puzzle-level-status';
            status.innerText = isCompleted ? '✅ 已通關' : (isUnlocked ? '🔓 可挑戰' : '🔒 未解鎖');
            
            item.appendChild(name);
            item.appendChild(status);
            
            if (isUnlocked) {
                item.addEventListener('click', () => {
                    this.selectPuzzleLevel(level);
                });
            }
            
            this.dom.puzzleLevelsList.appendChild(item);
        });

        // 載入自訂關卡
        GomokuDB.getAllPuzzles().then(customPuzzles => {
            if (customPuzzles.length === 0) return;
            
            const divider = document.createElement('div');
            divider.style.borderTop = '1px dashed var(--card-border)';
            divider.style.margin = '12px 0 6px 0';
            divider.style.fontSize = '0.75rem';
            divider.style.color = 'var(--accent-primary)';
            divider.style.textAlign = 'center';
            divider.innerText = '🛠️ 自訂殘局關卡';
            this.dom.puzzleLevelsList.appendChild(divider);
            
            customPuzzles.forEach(lvl => {
                const item = document.createElement('div');
                item.className = 'puzzle-level-item';
                
                const name = document.createElement('div');
                name.className = 'puzzle-level-name';
                name.innerText = lvl.title;
                
                const status = document.createElement('div');
                status.className = 'puzzle-level-status';
                status.innerText = `限 ${lvl.maxMoves} 步`;
                
                item.appendChild(name);
                item.appendChild(status);
                
                item.addEventListener('click', () => {
                    this.selectCustomPuzzleLevel(lvl);
                });
                
                const btnDel = document.createElement('button');
                btnDel.style.background = 'none';
                btnDel.style.border = 'none';
                btnDel.style.color = 'var(--text-muted)';
                btnDel.style.cursor = 'pointer';
                btnDel.style.fontSize = '0.75rem';
                btnDel.innerText = '❌';
                btnDel.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`確定要刪除自訂關卡「${lvl.title}」嗎？`)) {
                        GomokuDB.deletePuzzle(lvl.id).then(() => {
                            this.renderPuzzleLevels();
                        });
                    }
                });
                item.appendChild(btnDel);
                
                this.dom.puzzleLevelsList.appendChild(item);
            });
        });
    },

    selectPuzzleLevel(level) {
        this.state.gameMode = 'puzzle';
        this.state.currentPuzzleId = level.id;
        this.state.puzzleMaxMoves = level.limit;
        this.state.puzzleMovesUsed = 0;
        this.state.playerColor = level.playerColor;
        
        game.reset();
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                this.state.board[r][c] = 0;
            }
        }
        
        level.black.forEach(([r, c]) => {
            this.state.board[r][c] = 1;
        });
        level.white.forEach(([r, c]) => {
            this.state.board[r][c] = 2;
        });
        
        this.state.currentTurn = 1; 
        this.state.isGameOver = false;
        
        this.renderBoard();
        this.dom.puzzleStatusPanel.style.display = 'block';
        this.dom.puzzleLevelTitle.innerText = level.name;
        this.dom.puzzleLevelDesc.innerText = level.desc;
        this.dom.puzzleLimitText.innerText = level.limit;
        this.dom.puzzleUsedText.innerText = 0;
        
        this.dom.statusText.innerText = `關卡已載入，您執 ${level.playerColor === 1 ? '黑' : '白'}棋！`;
        
        if (level.playerColor === 2) {
            if (this.handlers.onAITrigger) this.handlers.onAITrigger();
        }
        
        this.renderPuzzleLevels();
    },

    selectCustomPuzzleLevel(lvl) {
        this.state.gameMode = 'puzzle';
        this.state.currentPuzzleId = `custom_${lvl.id}`;
        this.state.puzzleMaxMoves = lvl.maxMoves;
        this.state.puzzleMovesUsed = 0;
        this.state.playerColor = lvl.firstTurn;
        
        game.reset();
        this.state.board = lvl.board.map(row => [...row]);
        this.state.currentTurn = lvl.firstTurn;
        this.state.isGameOver = false;
        
        this.renderBoard();
        this.dom.puzzleStatusPanel.style.display = 'block';
        this.dom.puzzleLevelTitle.innerText = lvl.title;
        this.dom.puzzleLevelDesc.innerText = "自訂殘局關卡挑戰！請在限制步數內獲勝。";
        this.dom.puzzleLimitText.innerText = lvl.maxMoves;
        this.dom.puzzleUsedText.innerText = 0;
        
        this.dom.statusText.innerText = `自訂關卡已載入，您執 ${lvl.firstTurn === 1 ? '黑' : '白'}棋！`;
        
        if (lvl.firstTurn !== this.state.playerColor) {
            if (this.handlers.onAITrigger) this.handlers.onAITrigger();
        }
        
        this.renderPuzzleLevels();
    },

    importSGFFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const sgfText = e.target.result;
            try {
                this.loadSGFForReplay(sgfText);
                this.showSgfLibraryCard(false);
                this.showP2PToast("📤 成功匯入外部 SGF 棋譜並開啟復盤！");
            } catch(err) {
                alert("❌ SGF 檔案解析失敗，請確認檔案格式是否正確。");
            }
        };
        reader.readAsText(file);
    },

    loadSGFForReplay(sgfText) {
        const moveRecord = [];
        const regex = /;(B|W)\[([a-o])([a-o])\]/g;
        let match;
        while ((match = regex.exec(sgfText)) !== null) {
            const color = match[1] === 'B' ? 1 : 2;
            const c = match[2].charCodeAt(0) - 97;
            const r = match[3].charCodeAt(0) - 97;
            moveRecord.push({ r, c, color });
        }
        
        if (moveRecord.length === 0) {
            throw new Error("No moves found");
        }
        
        this.state.gameMode = 'ai';
        this.state.isReplayMode = true;
        this.state.moveRecord = moveRecord;
        this.state.replayIndex = moveRecord.length;
        
        game.reset();
        moveRecord.forEach(m => {
            this.state.board[m.r][m.c] = m.color;
        });
        this.state.lastMove = moveRecord[moveRecord.length - 1];
        this.state.isGameOver = true;
        
        this.renderBoard();
        
        this.dom.opsCard.style.display = 'none';
        this.dom.puzzleCard.style.display = 'none';
        this.dom.p2pCard.style.display = 'none';
        this.dom.replayCard.style.display = 'block';
        this.dom.replayStatus.innerText = `第 ${this.state.replayIndex} / ${moveRecord.length} 手`;
        
        this.dom.statusText.innerText = "對局復盤中，可使用按鈕分步觀看對局";
    },

    async saveCustomPuzzle() {
        const title = this.dom.puzzleEditTitle.value.trim() || '未命名自訂關卡';
        const maxMoves = parseInt(this.dom.puzzleEditMaxMoves.value) || 0;
        
        let firstTurn = 1;
        if (this.dom.puzzleEditTurnButtons) {
            this.dom.puzzleEditTurnButtons.forEach(btn => {
                if (btn.classList.contains('active')) {
                    firstTurn = parseInt(btn.dataset.turn);
                }
            });
        }
        
        let hasStone = false;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.state.board[r][c] !== 0) {
                    hasStone = true;
                    break;
                }
            }
        }
        
        if (!hasStone) {
            this.showP2PToast("⚠️ 棋盤目前為空，無法儲存殘局！", true);
            return;
        }
        
        try {
            await GomokuDB.savePuzzle(title, this.state.board, firstTurn, maxMoves);
            this.showP2PToast("💾 自訂關卡已儲存至本地庫！");
            this.renderPuzzleLevels();
        } catch (e) {
            console.error(e);
            this.showP2PToast("❌ 儲存關卡失敗", true);
        }
    },

    testCustomPuzzle() {
        const title = this.dom.puzzleEditTitle.value.trim() || '自訂測試殘局';
        const maxMoves = parseInt(this.dom.puzzleEditMaxMoves.value) || 0;
        
        let firstTurn = 1;
        if (this.dom.puzzleEditTurnButtons) {
            this.dom.puzzleEditTurnButtons.forEach(btn => {
                if (btn.classList.contains('active')) {
                    firstTurn = parseInt(btn.dataset.turn);
                }
            });
        }
        
        this.state.gameMode = 'puzzle';
        this.state.currentPuzzleId = 'custom_test';
        this.state.puzzleMaxMoves = maxMoves;
        this.state.puzzleMovesUsed = 0;
        this.state.playerColor = firstTurn;
        
        this.state.currentTurn = firstTurn;
        this.state.isGameOver = false;
        
        this.isPuzzleEditing = false;
        if (this.dom.puzzleEditorCard) this.dom.puzzleEditorCard.style.display = 'none';
        this.dom.puzzleCard.style.display = 'block';
        this.dom.puzzleStatusPanel.style.display = 'block';
        
        this.dom.puzzleLevelTitle.innerText = title;
        this.dom.puzzleLevelDesc.innerText = "正在進行自訂殘局測試挑戰！";
        this.dom.puzzleLimitText.innerText = maxMoves;
        this.dom.puzzleUsedText.innerText = 0;
        
        this.dom.statusText.innerText = `殘局測試開始，您執 ${firstTurn === 1 ? '黑' : '白'}棋！`;
        
        if (firstTurn !== this.state.playerColor) {
            if (this.handlers.onAITrigger) this.handlers.onAITrigger();
        }
        
        this.renderBoard();
        this.renderPuzzleLevels();
    }
};





