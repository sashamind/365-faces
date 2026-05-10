/* ============================================
   КОНФИГУРАЦИЯ
   ============================================ */
const CONFIG = {
  total: 365,
  photoAspect: 2 / 3,
  centerWidthRatio: 0.28,
  cellGap: 1,
  fadeDuration: 0.55,
  stepDelay: 36,
  scrollDelay: 22,
};

/* ============================================
   ЭЛЕМЕНТЫ DOM
   ============================================ */
const colLeft      = document.getElementById('col-left');
const colRight     = document.getElementById('col-right');
const colCenter    = document.getElementById('col-center');
const gridLeft     = document.getElementById('grid-left');
const gridRight    = document.getElementById('grid-right');
const featuredWrap = document.getElementById('featured-wrap');
const featuredEl   = document.getElementById('featured');
const imgA         = document.getElementById('featured-a');
const imgB         = document.getElementById('featured-b');
const captionName  = document.getElementById('caption-name');
const captionDay   = document.getElementById('caption-day');

/* ============================================
   СОСТОЯНИЕ
   ============================================ */
let cellsLeft  = [];
let cellsRight = [];
let activeSide = null;
let activeIdx  = -1;
let isFading   = false;
let layerTop   = imgA;
let layerBot   = imgB;

let observerLeft  = null;
let observerRight = null;

const NAMES = [
  'Иван', 'Мария', 'Алексей', 'Анна', 'Дмитрий',
  'Елена', 'Сергей', 'Ольга', 'Андрей', 'Наталья',
];

/* ============================================
   URL ЗАГЛУШКИ (picsum)
   ============================================ */
function getUrl(n, w, h) {
  return `https://picsum.photos/seed/p${n}/${w}/${h}`;
}

/* ============================================
   РАСЧЁТ РАЗМЕРОВ
   ============================================ */
function calcLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const centerW = Math.round(vw * CONFIG.centerWidthRatio);
  const sideW   = Math.round((vw - centerW) / 2);

  const reservedH = 28 + 28 + 40;
  const maxFeatH  = vh - reservedH;

  let featW = centerW - 32;
  let featH = Math.round(featW / CONFIG.photoAspect);

  if (featH > maxFeatH) {
    featH = maxFeatH;
    featW = Math.round(featH * CONFIG.photoAspect);
  }

  return { vw, vh, centerW, sideW, featW, featH };
}

/* ============================================
   РАСЧЁТ ЯЧЕЙКИ БОКОВОЙ СЕТКИ
   ============================================ */
function calcCellSize(sideW) {
  const cols  = 5;
  const cellW = Math.floor(sideW / cols);
  const cellH = Math.round(cellW / CONFIG.photoAspect);
  return { cols, cellW, cellH };
}

/* ============================================
   ПЕРЕМЕШАТЬ МАССИВ
   ============================================ */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ============================================
   ПОСТРОЕНИЕ СЕТКИ
   ============================================ */
function buildSideGridFromArray(container, indices, cols, cellW, cellH) {
  container.innerHTML = '';
  const cells = [];

  const rows  = Math.ceil(indices.length / cols);
  const gridH = rows * cellH;

  container.style.width  = (cols * cellW) + 'px';
  container.style.height = gridH + 'px';

  indices.forEach((photoNum, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const cell = document.createElement('div');
    cell.className    = 'cell cell-hidden';
    cell.style.left   = (col * cellW + CONFIG.cellGap) + 'px';
    cell.style.top    = (row * cellH + CONFIG.cellGap) + 'px';
    cell.style.width  = (cellW - CONFIG.cellGap) + 'px';
    cell.style.height = (cellH - CONFIG.cellGap) + 'px';
    cell.dataset.num  = photoNum;
    cell.dataset.day  = photoNum;

    const img = document.createElement('img');
    img.src      = getUrl(photoNum, cellW * 2, cellH * 2);
    img.alt      = '';
    img.loading  = 'lazy';
    img.decoding = 'async';

    cell.appendChild(img);
    container.appendChild(cell);
    cells.push(cell);
  });

  return cells;
}

/* ============================================
   ПРИМЕНИТЬ LAYOUT
   ============================================ */
function applyLayout() {
  const { centerW, sideW, featW, featH } = calcLayout();
  const { cols, cellW, cellH } = calcCellSize(sideW);

  colLeft.style.width  = sideW + 'px';
  colRight.style.width = sideW + 'px';

  colCenter.style.left  = sideW + 'px';
  colCenter.style.width = centerW + 'px';

  featuredWrap.style.width = featW + 'px';
  featuredEl.style.height  = featH + 'px';

  const indices = Array.from({ length: CONFIG.total }, (_, i) => i + 1);
  shuffleArray(indices);

  const leftCount    = Math.ceil(CONFIG.total / 2);
  const leftIndices  = indices.slice(0, leftCount);
  const rightIndices = indices.slice(leftCount);

  cellsLeft  = buildSideGridFromArray(gridLeft,  leftIndices,  cols, cellW, cellH);
  cellsRight = buildSideGridFromArray(gridRight, rightIndices, cols, cellW, cellH);
}

/* ============================================
   CROSSFADE
   ============================================ */
function showPhoto(num, dayNum) {
  if (isFading) return;
  isFading = true;

  const { featW, featH } = calcLayout();
  const newSrc = getUrl(num, featW * 2, featH * 2);

  layerBot.src = newSrc;

  const doFade = () => {
    gsap.to(layerTop, {
      opacity: 0,
      duration: CONFIG.fadeDuration,
      ease: 'power2.inOut',
      onComplete: () => {
        layerTop.style.zIndex  = '1';
        layerBot.style.zIndex  = '2';
        layerTop.style.opacity = '1';

        const tmp = layerTop;
        layerTop  = layerBot;
        layerBot  = tmp;

        isFading = false;
      }
    });

    captionName.textContent = NAMES[num % NAMES.length];
    captionDay.textContent  = `${dayNum}/365`;
  };

  if (layerBot.complete && layerBot.naturalWidth > 0) {
    doFade();
  } else {
    layerBot.onload  = doFade;
    layerBot.onerror = () => { isFading = false; };
  }
}

/* ============================================
   СБРОС АКТИВНОЙ ЯЧЕЙКИ
   ============================================ */
function clearActive() {
  if (activeSide === 'left' && activeIdx >= 0) {
    cellsLeft[activeIdx]?.classList.remove('is-active');
  } else if (activeSide === 'right' && activeIdx >= 0) {
    cellsRight[activeIdx]?.classList.remove('is-active');
  }
  activeIdx = -1;
}

/* ============================================
   HOVER
   ============================================ */
function attachHoverBoth() {
  gridLeft.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;

    clearActive();
    cell.classList.add('is-active');
    activeSide = 'left';
    activeIdx  = cellsLeft.indexOf(cell);

    showPhoto(parseInt(cell.dataset.num), parseInt(cell.dataset.day));
  });

  gridRight.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;

    clearActive();
    cell.classList.add('is-active');
    activeSide = 'right';
    activeIdx  = cellsRight.indexOf(cell);

    showPhoto(parseInt(cell.dataset.num), parseInt(cell.dataset.day));
  });
}

/* ============================================
   СЛУЧАЙНОЕ НАЧАЛЬНОЕ ФОТО
   ============================================ */
function showRandomPhoto() {
  const num = Math.floor(Math.random() * CONFIG.total) + 1;
  const { featW, featH } = calcLayout();

  layerTop.src           = getUrl(num, featW * 2, featH * 2);
  layerTop.style.opacity = '1';
  layerTop.style.zIndex  = '2';
  layerBot.style.zIndex  = '1';

  captionName.textContent = NAMES[num % NAMES.length];
  captionDay.textContent  = `${num}/365`;
}

/* ============================================
   ПОКАЗАТЬ ЯЧЕЙКУ
   ============================================ */
function revealCell(cell) {
  if (!cell.classList.contains('cell-hidden')) return;
  cell.classList.remove('cell-hidden');
  cell.classList.add('cell-visible');
}

/* ============================================
   ВОЛНОВОЙ ИНДЕКС ЯЧЕЙКИ
   Чем правее и выше — тем раньше появляется
   ============================================ */
function getWaveIndex(cell) {
  const cols  = 5;
  const cellW = parseFloat(cell.style.width)  + CONFIG.cellGap;
  const cellH = parseFloat(cell.style.height) + CONFIG.cellGap;
  const col   = Math.round(parseFloat(cell.style.left) / cellW);
  const row   = Math.round(parseFloat(cell.style.top)  / cellH);
  return row * cols + (cols - 1 - col);
}

/* ============================================
   АНИМАЦИЯ ПЕРВОГО ЭКРАНА — СЕТКИ
   Запускается только после раскрытия шторок
   ============================================ */
function animateGrids() {
  const cols = 5;
  const vh   = window.innerHeight;

  const visibleLeft = Array.from(gridLeft.querySelectorAll('.cell'))
    .filter(cell => parseFloat(cell.style.top) < vh);

  const visibleRight = Array.from(gridRight.querySelectorAll('.cell'))
    .filter(cell => parseFloat(cell.style.top) < vh);

  function revealGroup(cells, startOffset) {
    cells.forEach(cell => {
      const waveIdx = getWaveIndex(cell);
      const delay   = startOffset + waveIdx * CONFIG.stepDelay;
      setTimeout(() => revealCell(cell), delay);
    });
  }

  // Правая сетка стартует первой, левая — чуть позже
  revealGroup(visibleRight, 0);
  revealGroup(visibleLeft,  CONFIG.stepDelay * cols);
}

/* ============================================
   SCROLL-АНИМАЦИЯ
   ============================================ */
function setupScrollAnimation(scrollEl, cells) {
  const rowMap = new Map();

  cells.forEach(cell => {
    const cellH = parseFloat(cell.style.height) + CONFIG.cellGap;
    const row   = Math.round(parseFloat(cell.style.top) / cellH);
    if (!rowMap.has(row)) rowMap.set(row, []);
    rowMap.get(row).push(cell);
  });

  const triggers = new Map();

  rowMap.forEach((rowCells) => {
    const sorted = [...rowCells].sort((a, b) =>
      parseFloat(b.style.left) - parseFloat(a.style.left)
    );
    triggers.set(sorted[0], rowCells);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const triggerCell = entry.target;
      const rowCells    = triggers.get(triggerCell);
      if (!rowCells) return;

      const sorted = [...rowCells].sort((a, b) =>
        parseFloat(b.style.left) - parseFloat(a.style.left)
      );

      sorted.forEach((cell, i) => {
        setTimeout(() => revealCell(cell), i * CONFIG.scrollDelay);
      });

      observer.unobserve(triggerCell);
    });
  }, {
    root: scrollEl,
    rootMargin: '0px',
    threshold: 0.1,
  });

  triggers.forEach((rowCells, triggerCell) => {
    const top = parseFloat(triggerCell.style.top);
    if (top >= window.innerHeight) {
      observer.observe(triggerCell);
    }
  });

  return observer;
}

/* ============================================
   ЗАПУСК SCROLL-АНИМАЦИИ ДЛЯ ОБЕИХ СЕТОК
   ============================================ */
function setupScrollBoth() {
  if (observerLeft)  observerLeft.disconnect();
  if (observerRight) observerRight.disconnect();

  observerLeft  = setupScrollAnimation(colLeft,  cellsLeft);
  observerRight = setupScrollAnimation(colRight, cellsRight);
}

/* ============================================
   ЭТАП 1: АНИМАЦИЯ ОТКРЫТИЯ ЦЕНТРАЛЬНОГО ФОТО
   После завершения шторок — пауза 2с — затем сетка
   ============================================ */
function animateFeaturedOpen(onComplete) {
  // Показываем обёртку
  featuredWrap.classList.add('is-revealed');

  // Запускаем шторки
  setTimeout(() => {
    featuredEl.classList.add('is-open');
  }, 100);

  // Подпись появляется когда шторки почти разошлись
  gsap.fromTo(
    document.getElementById('featured-caption'),
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: 0.5, delay: 0.9, ease: 'power2.out' }
  );

  // 100ms + 1100ms анимация шторок + 2300ms пауза = 3500ms
  setTimeout(() => {
    if (onComplete) onComplete();
  }, 3500);
}

/* ============================================
   РЕСАЙЗ
   ============================================ */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    applyLayout();
    attachHoverBoth();
    animateGrids();
    setupScrollBoth();
  }, 150);
});

/* ============================================
   СТАРТ
   Этап 1: центральное фото (шторки)
   Этап 2: сетки появляются после паузы
   ============================================ */
applyLayout();
attachHoverBoth();
showRandomPhoto();

animateFeaturedOpen(() => {
  animateGrids();
  setupScrollBoth();
});