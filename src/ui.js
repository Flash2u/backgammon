import { BOARD_SIZE, game } from './game.js';

export const ui = {
    state: null,
    handlers: null,
    dom: {},

    init(gameState, eventHandlers) {
        this.state = gameState;
        this.handlers = eventHandlers;

        this.cacheDOM();
        this.createBoardGrid();
        this.bindEvents();
        this.loadSettings();
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
        this.dom.btnStart.addEventListener('click', () => this.handlers.onRestartClick());
        this.dom.btnModalRestart.addEventListener('click', () => {
            this.dom.winModal.classList.remove('active');
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

        this.dom.btnModalClose.addEventListener('click', () => this.dom.winModal.classList.remove('active'));

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
    },
 
    clearThreatHints() {
        const rings = this.dom.board.querySelectorAll('.threat-ring');
        rings.forEach(r => r.remove());
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
                this.dom.statusText.innerText = '等待對手連線...';
                this.dom.statusText.style.color = 'var(--accent-primary)';
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

    showGameEndModal(winner, winningStones) {
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
            } else {
                titleText = '🏆 棋局已分！';
                const winnerName = winner === 1 ? '先手黑棋' : '後手白棋';
                const loserName = winner === 1 ? '後手白棋' : '先手黑棋';
                msgText = `恭喜 ${winnerName} 贏得本場勝利！\n【 贏家：${winnerName} ｜ 輸家：${loserName} 】`;
            }
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
        this.dom.lobbyRoomsList.innerHTML = '';
        
        if (error) {
            this.dom.lobbyRoomsList.innerHTML = '<div style="text-align: center; padding: 12px; color: #ef4444; font-weight: 500;">⚠️ 大廳載入失敗 (請檢查網路或稍後重試)</div>';
            return;
        }
        
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
    }
};


