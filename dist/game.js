(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const SIZE = 30;
  const COLORS = {
    I: '#36dff4', J: '#6374ff', L: '#ff9f37', O: '#f7df45',
    S: '#52df82', T: '#b36cff', Z: '#ff5871'
  };
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
  };

  const boardCanvas = document.querySelector('#board');
  const ctx = boardCanvas.getContext('2d');
  const nextCanvas = document.querySelector('#next');
  const nextCtx = nextCanvas.getContext('2d');
  const el = {
    score: document.querySelector('#score'),
    best: document.querySelector('#best'),
    lines: document.querySelector('#lines'),
    level: document.querySelector('#level'),
    status: document.querySelector('#status'),
    overlay: document.querySelector('#overlay'),
    overlayTitle: document.querySelector('#overlayTitle'),
    overlayCopy: document.querySelector('#overlayCopy'),
    overlayButton: document.querySelector('#overlayButton'),
    pauseButton: document.querySelector('#pauseButton'),
    pauseIcon: document.querySelector('#pauseIcon'),
    pauseText: document.querySelector('#pauseText'),
    restartButton: document.querySelector('#restartButton')
  };

  let bag = [];
  let grid = emptyGrid();
  let active = null;
  let next = makePiece();
  let score = 0;
  let lines = 0;
  let level = 1;
  let best = readBest();
  let mode = 'ready';
  let lastFrame = 0;
  let dropTimer = 0;

  function emptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function readBest() {
    try { return Number(localStorage.getItem('neon-stack-best') || 0); }
    catch { return 0; }
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('neon-stack-best', String(best)); } catch { /* storage may be unavailable */ }
  }

  function refillBag() {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function makePiece() {
    if (!bag.length) refillBag();
    const type = bag.pop();
    return { type, matrix: SHAPES[type].map(row => [...row]), x: 0, y: 0 };
  }

  function spawn() {
    active = next;
    next = makePiece();
    active.x = Math.floor((COLS - active.matrix[0].length) / 2);
    active.y = active.type === 'I' ? -1 : 0;
    drawNext();
    if (collides(active, 0, 0)) finishGame();
  }

  function collides(piece, dx, dy, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const gx = piece.x + x + dx;
        const gy = piece.y + y + dy;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function move(dx) {
    if (mode !== 'playing' || collides(active, dx, 0)) return;
    active.x += dx;
  }

  function rotate() {
    if (mode !== 'playing') return;
    const rotated = active.matrix[0].map((_, x) => active.matrix.map(row => row[x]).reverse());
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(active, kick, 0, rotated)) {
        active.x += kick;
        active.matrix = rotated;
        return;
      }
    }
  }

  function softDrop(manual = false) {
    if (mode !== 'playing') return;
    if (!collides(active, 0, 1)) {
      active.y++;
      if (manual) score++;
    } else {
      lockPiece();
    }
    dropTimer = 0;
    updateStats();
  }

  function hardDrop() {
    if (mode !== 'playing') return;
    let distance = 0;
    while (!collides(active, 0, 1)) { active.y++; distance++; }
    score += distance * 2;
    lockPiece();
    updateStats();
  }

  function lockPiece() {
    let aboveTop = false;
    active.matrix.forEach((row, y) => row.forEach((cell, x) => {
      if (!cell) return;
      const gy = active.y + y;
      if (gy < 0) aboveTop = true;
      else grid[gy][active.x + x] = active.type;
    }));
    if (aboveTop) { finishGame(); return; }
    clearRows();
    spawn();
  }

  function clearRows() {
    let count = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (!grid[y].every(Boolean)) continue;
      grid.splice(y, 1);
      grid.unshift(Array(COLS).fill(null));
      count++;
      y++;
    }
    if (!count) return;
    lines += count;
    score += [0, 100, 300, 500, 800][count] * level;
    level = Math.floor(lines / 10) + 1;
    saveBest();
  }

  function ghostRow() {
    let y = active.y;
    const probe = { ...active, y };
    while (!collides(probe, 0, 1)) { y++; probe.y = y; }
    return y;
  }

  function drawCell(context, x, y, size, color, alpha = 1) {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,.23)';
    context.fillRect(x * size + 2, y * size + 2, size - 4, 2);
    context.fillStyle = 'rgba(0,0,0,.2)';
    context.fillRect(x * size + 2, y * size + size - 4, size - 4, 2);
    context.restore();
  }

  function drawMatrix(matrix, ox, oy, type, alpha = 1) {
    matrix.forEach((row, y) => row.forEach((cell, x) => {
      if (cell && oy + y >= 0) drawCell(ctx, ox + x, oy + y, SIZE, COLORS[type], alpha);
    }));
  }

  function drawBoard() {
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * SIZE + .5, 0); ctx.lineTo(x * SIZE + .5, boardCanvas.height); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * SIZE + .5); ctx.lineTo(boardCanvas.width, y * SIZE + .5); ctx.stroke();
    }
    grid.forEach((row, y) => row.forEach((type, x) => {
      if (type) drawCell(ctx, x, y, SIZE, COLORS[type]);
    }));
    if (active && (mode === 'playing' || mode === 'paused')) {
      drawMatrix(active.matrix, active.x, ghostRow(), active.type, .16);
      drawMatrix(active.matrix, active.x, active.y, active.type);
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const cells = [];
    next.matrix.forEach((row, y) => row.forEach((cell, x) => { if (cell) cells.push({ x, y }); }));
    const minX = Math.min(...cells.map(cell => cell.x));
    const maxX = Math.max(...cells.map(cell => cell.x));
    const minY = Math.min(...cells.map(cell => cell.y));
    const maxY = Math.max(...cells.map(cell => cell.y));
    const size = 22;
    const ox = (nextCanvas.width - (maxX - minX + 1) * size) / 2 - minX * size;
    const oy = (nextCanvas.height - (maxY - minY + 1) * size) / 2 - minY * size;
    cells.forEach(({ x, y }) => {
      nextCtx.fillStyle = COLORS[next.type];
      nextCtx.fillRect(ox + x * size + 1, oy + y * size + 1, size - 2, size - 2);
      nextCtx.fillStyle = 'rgba(255,255,255,.2)';
      nextCtx.fillRect(ox + x * size + 2, oy + y * size + 2, size - 4, 2);
    });
  }

  function updateStats() {
    saveBest();
    el.score.textContent = String(score).padStart(6, '0');
    el.best.textContent = String(best).padStart(6, '0');
    el.lines.textContent = String(lines).padStart(2, '0');
    el.level.textContent = String(level).padStart(2, '0');
  }

  function showOverlay(title, copy, action) {
    el.overlayTitle.innerHTML = title;
    el.overlayCopy.textContent = copy;
    el.overlayButton.childNodes[0].nodeValue = `${action} `;
    el.overlay.classList.remove('hidden');
  }

  function startGame() {
    grid = emptyGrid();
    bag = [];
    next = makePiece();
    score = 0;
    lines = 0;
    level = 1;
    dropTimer = 0;
    mode = 'playing';
    spawn();
    el.status.textContent = 'PLAYING';
    el.overlay.classList.add('hidden');
    el.pauseButton.disabled = false;
    el.pauseIcon.textContent = 'Ⅱ';
    el.pauseText.textContent = '일시정지';
    updateStats();
  }

  function togglePause() {
    if (mode === 'playing') {
      mode = 'paused';
      el.status.textContent = 'PAUSED';
      el.pauseIcon.textContent = '▶';
      el.pauseText.textContent = '계속하기';
      showOverlay('잠시 멈춤', '준비되면 이어서 플레이하세요.', '계속하기');
    } else if (mode === 'paused') {
      mode = 'playing';
      el.status.textContent = 'PLAYING';
      el.pauseIcon.textContent = 'Ⅱ';
      el.pauseText.textContent = '일시정지';
      el.overlay.classList.add('hidden');
      lastFrame = performance.now();
    }
  }

  function finishGame() {
    mode = 'gameover';
    saveBest();
    updateStats();
    el.status.textContent = 'GAME OVER';
    el.pauseButton.disabled = true;
    showOverlay('게임 오버', `${score.toLocaleString()}점 · ${lines}줄 완성`, '다시 도전');
  }

  function act(action) {
    const actions = { left: () => move(-1), right: () => move(1), rotate, down: () => softDrop(true), drop: hardDrop };
    actions[action]?.();
  }

  function loop(time = 0) {
    const delta = Math.min(100, time - lastFrame);
    lastFrame = time;
    if (mode === 'playing') {
      dropTimer += delta;
      const delay = Math.max(90, 800 - (level - 1) * 65);
      if (dropTimer >= delay) softDrop();
    }
    drawBoard();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', event => {
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop' };
    if (keys[event.key]) {
      event.preventDefault();
      act(keys[event.key]);
    } else if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      togglePause();
    }
  });

  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      act(button.dataset.action);
    });
  });

  el.overlayButton.addEventListener('click', () => mode === 'paused' ? togglePause() : startGame());
  el.pauseButton.addEventListener('click', togglePause);
  el.restartButton.addEventListener('click', startGame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') togglePause();
  });

  updateStats();
  drawNext();
  requestAnimationFrame(loop);
})();

