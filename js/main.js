class LotterySystem {
    constructor() {
        this.isRunning = false;
        this.timer = null;
        this.candidates = [];
        this.winners = {
            1: [], // 一等奖获奖者
            2: [], // 二等奖获奖者
            3: []  // 三等奖获奖者
        };
        
        this.connectWebSocket();
        this.createMovingBackground();
        this.loadEmployees();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:3000`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket connection closed');
            // 尝试重新连接
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'START_LOTTERY':
                if (!this.isRunning) {
                    this.startLottery(true);
                }
                break;
            case 'STOP_LOTTERY':
                if (this.isRunning) {
                    this.stopLottery(true);
                }
                break;
            case 'UPDATE_CANDIDATE':
                if (this.isRunning) {
                    this.updateDisplay(data.candidate);
                }
                break;
            case 'WINNER':
                this.updateWinner(data.winner, data.prizeLevel);
                break;
        }
    }

    broadcastMessage(type, data = {}) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type,
                ...data
            }));
        }
    }

    createMovingBackground() {
        const movingNames = document.querySelector('.moving-names');
        const rowCount = Math.ceil(window.innerHeight / 30); // 30px 为每行高度

        for (let i = 0; i < rowCount; i++) {
            const row = document.createElement('div');
            row.className = 'name-row';
            row.style.top = `${i * 30}px`;
            // 随机延迟，使每行的动画开始时间不同
            const delay = -Math.random() * 300;
            row.style.animationDelay = `${delay}s`;
            row.dataset.originalDelay = `${delay}s`;  // 保存原始延迟时间
            // 随机动画持续时间（180-300秒之间）
            const duration = 300 + Math.random() * 200;  // 300-500秒之间
            row.style.setProperty('--duration', `${duration}s`);
            movingNames.appendChild(row);
        }
    }

    updateMovingNames() {
        const rows = document.querySelectorAll('.name-row');
        const names = this.candidates.map(emp => emp.name);
        
        rows.forEach(row => {
            // 创建足够多的名字来填满一行
            const repeatedNames = Array(10).fill(names).flat();
            // 随机打乱名字顺序
            const shuffledNames = this.shuffleArray([...repeatedNames]);
            row.textContent = shuffledNames.join(' • ');
        });
    }

    async loadEmployees() {
        try {
            const response = await fetch('data/employees.json');
            const data = await response.json();
            this.candidates = [...data.employees];
            this.updateMovingNames();
            this.init();
        } catch (error) {
            console.error('加载员工数据失败:', error);
            alert('加载员工数据失败，请刷新页面重试');
        }
    }

    init() {
        this.startBtn = document.getElementById('startBtn');
        this.result = document.getElementById('result');
        this.prizeSelect = document.getElementById('prizeSelect');
        this.winnersList = document.getElementById('winnersList');

        this.startBtn.addEventListener('click', () => this.toggleLottery());
        this.prizeSelect.addEventListener('change', () => this.handlePrizeSelect());
    }

    handlePrizeSelect() {
        const selectedValue = this.prizeSelect.value;
        this.startBtn.disabled = selectedValue === '0';
    }

    toggleLottery() {
        if (this.prizeSelect.value === '0') {
            alert('请先选择奖项！');
            return;
        }

        if (!this.isRunning) {
            this.startLottery();
        } else {
            this.stopLottery();
        }
    }

    startLottery() {
        if (this.candidates.length === 0) {
            alert('抽奖池已空！');
            return;
        }

        this.isRunning = true;
        this.startBtn.textContent = '停止';
        this.broadcastMessage('START_LOTTERY');
        
        // 激活背景动画
        const rows = document.querySelectorAll('.name-row');
        rows.forEach((row, index) => {
            row.classList.add('active');
            row.style.animation = `floating ${3 + Math.random() * 2}s ease-in-out infinite`;
            row.style.animationDelay = `${index * 0.1}s`;
        });

        this.timer = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * this.candidates.length);
            const candidate = this.candidates[randomIndex];
            this.broadcastMessage('UPDATE_CANDIDATE', { candidate });
            this.updateDisplay(candidate);
        }, 50);
    }

    updateDisplay(candidate) {
        this.result.innerHTML = `
            <img src="${candidate.avatar}" class="avatar" alt="${candidate.name}的照片">
            <div>${candidate.name}</div>
        `;
    }

    stopLottery() {
        this.isRunning = false;
        this.startBtn.textContent = '开始抽奖';
        clearInterval(this.timer);
        this.broadcastMessage('STOP_LOTTERY');
        
        // 恢复背景动画
        const rows = document.querySelectorAll('.name-row');
        rows.forEach(row => {
            row.classList.remove('active');
            row.style.animation = `moveLeft ${row.style.getPropertyValue('--duration')} linear infinite`;
            row.style.animationDelay = row.dataset.originalDelay;
        });

        const prizeLevel = this.prizeSelect.value;
        // 获取当前显示在界面上的名字
        const currentName = this.result.querySelector('div').textContent;
        // 从候选人中找到对应的人
        const winner = this.candidates.find(emp => emp.name === currentName);

        if (winner) {
            this.winners[prizeLevel].push(winner);
            this.candidates = this.candidates.filter(emp => emp.id !== winner.id);
            this.broadcastMessage('WINNER', { winner, prizeLevel });
            this.updateMovingNames();
            this.updateWinnersList();
        } else {
            alert('抽奖出错，请重试！');
        }
    }

    updateWinnersList() {
        this.winnersList.innerHTML = '';
        for (let level = 1; level <= 3; level++) {
            if (this.winners[level].length > 0) {
                const levelTitle = document.createElement('li');
                levelTitle.className = 'winner-level';
                levelTitle.textContent = `${level}等奖`;
                this.winnersList.appendChild(levelTitle);

                this.winners[level].forEach(winner => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <img src="${winner.avatar}" class="winner-avatar" alt="${winner.name}的照片">
                        <span>${winner.name}</span>
                    `;
                    this.winnersList.appendChild(li);
                });
            }
        }
    }

    // Fisher-Yates 洗牌算法
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// 初始化抽奖系统
document.addEventListener('DOMContentLoaded', () => {
    new LotterySystem();
}); 