/* ============================================
   КОНФИГУРАЦИЯ
   ============================================ */
const CONFIG = {
  total:            365,
  photoAspect:      2 / 3,
  centerWidthRatio: 0.28,
  cellGap:          10,
  fadeDuration:     0.4,
  stepDelay:        36,
  scrollDelay:      22,
  hoverDelay:       1000,
};

/* ============================================
   ИМЕНА
   ============================================ */
const NAMES = [
  'Иван','Мария','Алексей','Анна','Дмитрий',
  'Елена','Сергей','Ольга','Андрей','Наталья',
];

/* ============================================
   ДАННЫЕ О ЛЮДЯХ
   ============================================ */
function buildPeopleData() {
  const data = {};
  for (let id = 1; id <= CONFIG.total; id++) {
    const seriesCount = 2 + (id % 5);
    const series = [];
    for (let s = 1; s <= seriesCount; s++) {
      series.push(`https://picsum.photos/seed/${id * 100 + s}/800/1200`);
    }
    data[id] = { id, name: NAMES[id % NAMES.length], series };
  }
  return data;
}

/* ============================================
   ЭЛЕМЕНТЫ DOM
   ============================================ */
const colLeft      = document.getElementById('col-left');
const colRight     = document.getElementById('col-right');
const colCenter    = document.getElementById('col-center');
const featuredWrap = document.getElementById('featured-wrap');
const featuredEl   = document.getElementById('featured');
const imgA         = document.getElementById('featured-a');
const imgB         = document.getElementById('featured-b');
const captionName  = document.getElementById('caption-name');
const logoLeft     = document.getElementById('project-logo');
const logoRight    = document.getElementById('project-logo-bottom');

/* ============================================
   СОСТОЯНИЕ
   ============================================ */
let cellsLeft   = [];
let cellsRight  = [];
let cellsMobile = [];
let activeSide = null;
let activeIdx  = -1;

// Crossfade слои
let isFading   = false;
let pendingSrc = null;
let layerTop   = imgA;
let layerBot   = imgB;

// Серия фото одного человека
let currentPersonId  = null;
let currentSeries    = [];
let currentSeriesIdx = 0;

// IntersectionObserver для скролл-анимации
let observerLeft  = null;
let observerRight = null;

// Данные
let PEOPLE_DATA = {};

// Кэш предзагруженных изображений
const preloadCache = {};

// Флаг первого показа
let isFirstLoad = true;

/* ============================================
   ОПРЕДЕЛЕНИЕ МОБИЛЬНОГО УСТРОЙСТВА
   ============================================ */
function isMobile() {
  return window.innerWidth <= 900;
}

/* ============================================
   РАСЧЁТ LAYOUT
   sideW  — ширина одной боковой колонки
   centerW — ширина центральной колонки
   featW  — чётная ширина фото (для ровного offset)
   ============================================ */
function calcLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const sideW   = Math.floor(vw * (1 - CONFIG.centerWidthRatio) / 2);
  const centerW = vw - sideW * 2;

  const reservedH = 28 + 28 + 40;
  const maxFeatH  = vh - reservedH;

  let featW = centerW - 32;
  let featH = Math.round(featW / CONFIG.photoAspect);

  if (featH > maxFeatH) {
    featH = maxFeatH;
    featW = Math.round(featH * CONFIG.photoAspect);
  }

  // Чётный featW — чтобы offset = (centerW - featW) / 2
  // всегда был целым числом и фото стояло ровно
  if (featW % 2 !== 0) featW -= 1;
  featH = Math.round(featW / CONFIG.photoAspect);

  return { vw, vh, centerW, sideW, featW, featH };
}

/* ============================================
   РАСЧЁТ РАЗМЕРА ЯЧЕЙКИ
   ============================================ */
function calcCellSize(sideW) {
  const cols  = 5;
  const cellW = Math.floor(sideW / cols);
  const cellH = Math.round(cellW / CONFIG.photoAspect);
  return { cols, cellW, cellH };
}

/* ============================================
   ПЕРЕМЕШАТЬ МАССИВ (Fisher-Yates)
   ============================================ */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ============================================
   ПОСТРОЕНИЕ СЕТКИ
   halfGap — симметричный отступ от края,
   чтобы зазоры были одинаковы со всех сторон
   ============================================ */
function buildSideGridFromArray(container, indices, cols, cellW, cellH) {
  container.innerHTML = '';
  const cells   = [];
  const rows    = Math.ceil(indices.length / cols);
  const gridH   = rows * cellH;
  const halfGap = Math.floor(CONFIG.cellGap / 2);

  container.style.width  = (cols * cellW) + 'px';
  container.style.height = gridH + 'px';

  indices.forEach((photoNum, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const cell = document.createElement('div');
    cell.className    = 'cell cell-hidden';

    // halfGap от края = симметрия с зазором между ячейками
    cell.style.left   = (col * cellW + halfGap) + 'px';
    cell.style.top    = (row * cellH + halfGap) + 'px';
    cell.style.width  = (cellW - CONFIG.cellGap) + 'px';
    cell.style.height = (cellH - CONFIG.cellGap) + 'px';

    cell.dataset.num = photoNum;
    cell.dataset.day = photoNum;
    cell.dataset.src =
      `https://picsum.photos/seed/${photoNum * 100 + 1}/${cellW * 2}/${cellH * 2}`;

    const img = document.createElement('img');
    img.alt      = '';
    img.decoding = 'async';

    cell.appendChild(img);
    container.appendChild(cell);
    cells.push(cell);
  });

  return cells;
}

/* ============================================
   ПРИМЕНИТЬ LAYOUT — расставить все элементы
   ============================================ */
function applyLayout() {
  if (isMobile()) { applyMobileLayout(); return; }

  const { centerW, sideW, featW, featH } = calcLayout();
  const { cols, cellW, cellH } = calcCellSize(sideW);

  // Боковые колонки
  colLeft.style.width  = sideW + 'px';
  colRight.style.width = sideW + 'px';

  // Центральная колонка строго между боковыми
  colCenter.style.left  = sideW + 'px';
  colCenter.style.width = centerW + 'px';

  // Фото центрируется через margin auto
  featuredWrap.style.width  = featW + 'px';
  featuredWrap.style.margin = '0 auto';
  featuredEl.style.height   = featH + 'px';


  // Строим сетки — перемешанные индексы
  const indices = Array.from({ length: CONFIG.total }, (_, i) => i + 1);
  shuffleArray(indices);

  const leftCount    = Math.ceil(CONFIG.total / 2);
  const leftIndices  = indices.slice(0, leftCount);
  const rightIndices = indices.slice(leftCount);

  const gridLeft  = document.getElementById('grid-left');
  const gridRight = document.getElementById('grid-right');

  cellsLeft  = buildSideGridFromArray(gridLeft,  leftIndices,  cols, cellW, cellH);
  cellsRight = buildSideGridFromArray(gridRight, rightIndices, cols, cellW, cellH);
}

/* ============================================
   МОБИЛЬНЫЙ LAYOUT
   ============================================ */
function applyMobileLayout() {
  colCenter.style.left   = '';
  colCenter.style.width  = '';
  featuredEl.style.height = '';
  buildMobileGrid();
}

/* ============================================
   МОБИЛЬНАЯ СЕТКА — 2 ряда, горизонтальный скролл
   ============================================ */
function buildMobileGrid() {
  const colBottom  = document.getElementById('col-bottom');
  const gridEl     = document.getElementById('grid-mobile');
  const gap        = 8;
  const containerH = colBottom.offsetHeight || Math.round(window.innerHeight * 0.37);
  const cellH      = Math.floor((containerH - gap * 3) / 2);
  const cellW      = Math.round(cellH * CONFIG.photoAspect);

  gridEl.innerHTML = '';
  gridEl.style.gridAutoColumns   = cellW + 'px';
  gridEl.style.gridTemplateRows  = `repeat(2, ${cellH}px)`;

  const indices = Array.from({ length: CONFIG.total }, (_, i) => i + 1);
  shuffleArray(indices);

  cellsMobile = indices.map(photoNum => {
    const cell       = document.createElement('div');
    cell.className   = 'cell cell-hidden';
    cell.dataset.num = photoNum;
    cell.dataset.src = `https://picsum.photos/seed/${photoNum * 100 + 1}/${cellW * 2}/${cellH * 2}`;

    const img    = document.createElement('img');
    img.alt      = '';
    img.decoding = 'async';

    cell.appendChild(img);
    gridEl.appendChild(cell);
    return cell;
  });
}

/* ============================================
   МОБИЛЬНЫЕ СОБЫТИЯ — тап меняет фото
   ============================================ */
function attachMobileEvents() {
  const colBottom = document.getElementById('col-bottom');
  colBottom.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    showPerson(parseInt(cell.dataset.num));
  });
}

/* ============================================
   МОБИЛЬНАЯ АНИМАЦИЯ СЕТКИ
   IntersectionObserver по горизонтальному скроллу
   ============================================ */
function animateMobileGrid() {
  const colBottom = document.getElementById('col-bottom');
  const observer  = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      loadAndRevealCell(entry.target);
      observer.unobserve(entry.target);
    });
  }, { root: colBottom, threshold: 0.1 });

  cellsMobile.forEach(cell => observer.observe(cell));
}

/* ============================================
   ПРЕДЗАГРУЗКА СЕРИИ ФОТО
   Загружаем в фоне, чтобы показ был мгновенным
   ============================================ */
function preloadSeries(personId) {
  const person = PEOPLE_DATA[personId];
  if (!person) return;
  person.series.forEach(src => {
    if (preloadCache[src]) return;
    const img = new Image();
    img.src = src;
    preloadCache[src] = img;
  });
}

/* ============================================
   CROSSFADE — плавная смена фото
   layerTop — текущий видимый слой
   layerBot — следующий, грузится снизу
   ============================================ */
function showPhotoSrc(src) {
  // Если уже идёт смена — ставим в очередь
  if (isFading) { pendingSrc = src; return; }
  isFading   = true;
  pendingSrc = null;

  layerBot.src = src;

  const doFade = () => {
    gsap.to(layerTop, {
      opacity: 0,
      duration: CONFIG.fadeDuration,
      ease: 'power2.inOut',
      onComplete: () => {
        // Меняем слои местами
        layerTop.style.zIndex  = '1';
        layerBot.style.zIndex  = '2';
        layerTop.style.opacity = '1';
        const tmp = layerTop;
        layerTop  = layerBot;
        layerBot  = tmp;
        isFading  = false;

        // Если пришёл новый запрос пока фейдили — показываем его
        if (pendingSrc) {
          const next = pendingSrc;
          pendingSrc = null;
          showPhotoSrc(next);
        }
      }
    });
  };

  // Если картинка уже загружена — фейдим сразу
  if (layerBot.complete && layerBot.naturalWidth > 0) {
    doFade();
  } else {
    layerBot.onload  = doFade;
    layerBot.onerror = () => {
      isFading = false;
      if (pendingSrc) {
        const n = pendingSrc;
        pendingSrc = null;
        showPhotoSrc(n);
      }
    };
  }
}

/* ============================================
   ОБНОВИТЬ ПОДПИСЬ ПОД ФОТО
   ============================================ */
function updateCaption(name, day) {
  const dayNum   = document.getElementById('caption-day-num');
  const dayTotal = document.getElementById('caption-day-total');
  const caption  = document.getElementById('featured-caption');

  // Не обновляем если данные не изменились
  if (captionName.textContent === name &&
      dayNum.textContent === `${day}/`) return;

  gsap.to(caption, {
    opacity: 0, y: 4, duration: 0.15, ease: 'power2.in',
    onComplete: () => {
      captionName.textContent = name;
      dayNum.textContent      = `${day}/`;
      dayTotal.textContent    = '365';
      gsap.to(caption, {
        opacity: 1, y: 0, duration: 0.2, ease: 'power2.out'
      });
    }
  });
}

/* ============================================
   ПОКАЗАТЬ ЧЕЛОВЕКА — главная функция
   Устанавливает серию, показывает первое фото
   ============================================ */
function showPerson(personId) {
  const person = PEOPLE_DATA[personId];
  if (!person) return;

  currentPersonId  = personId;
  currentSeries    = person.series;
  currentSeriesIdx = 0;

  updateCaption(person.name, personId);
  showPhotoSrc(currentSeries[0]);
  updateSeriesIndicator();
}

/* ============================================
   ИНДИКАТОР СЕРИИ — точки под фото
   Показывает сколько фото в серии и какое сейчас
   ============================================ */
function updateSeriesIndicator() {
  const indicator = document.getElementById('series-indicator');
  if (!indicator) return;

  const dots = indicator.querySelectorAll('.series-dot');

  // Если точек столько же — просто переключаем активную
  if (dots.length === currentSeries.length) {
    dots.forEach((dot, i) =>
      dot.classList.toggle('is-active', i === currentSeriesIdx)
    );
    return;
  }

  // Иначе — перестраиваем точки
  gsap.killTweensOf(indicator);
  indicator.style.opacity = '0';
  indicator.innerHTML     = '';

  if (currentSeries.length <= 1) return;

  currentSeries.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'series-dot' + (i === currentSeriesIdx ? ' is-active' : '');
    indicator.appendChild(dot);
  });

  gsap.to(indicator, {
    opacity: 1,
    duration: 0.2,
    delay: isFirstLoad ? 0.45 : 0.05,
    ease: 'power2.out',
    onComplete: () => { isFirstLoad = false; }
  });
}

/* ============================================
   СКРАБИНГ МЫШЬЮ ПО БОЛЬШОМУ ФОТО
   Двигаешь мышь влево-вправо — листаешь серию
   ============================================ */
function setupScrubbing() {
  const scrubOverlay = document.getElementById('scrub-overlay');
  if (!scrubOverlay) return;

  // Десктоп: скрабинг позицией мыши
  if (!('ontouchstart' in window)) {
    scrubOverlay.addEventListener('mousemove', (e) => {
      if (currentSeries.length <= 1) return;
      const rect   = scrubOverlay.getBoundingClientRect();
      const ratio  = (e.clientX - rect.left) / rect.width;
      const newIdx = Math.min(Math.floor(ratio * currentSeries.length), currentSeries.length - 1);
      if (newIdx !== currentSeriesIdx) {
        currentSeriesIdx = newIdx;
        showPhotoSrc(currentSeries[currentSeriesIdx]);
        updateSeriesIndicator();
      }
    });

    scrubOverlay.addEventListener('mouseleave', () => {
      if (currentSeriesIdx !== 0) {
        currentSeriesIdx = 0;
        showPhotoSrc(currentSeries[0]);
        updateSeriesIndicator();
      }
    });
  }

  // Десктоп: горизонтальный свайп тачпадом
  let accumX = 0;
  scrubOverlay.addEventListener('wheel', (e) => {
    if (currentSeries.length <= 1) return;
    e.preventDefault();
    accumX += e.deltaX;
    if (Math.abs(accumX) < 40) return;
    currentSeriesIdx = accumX > 0
      ? Math.min(currentSeriesIdx + 1, currentSeries.length - 1)
      : Math.max(currentSeriesIdx - 1, 0);
    accumX = 0;
    showPhotoSrc(currentSeries[currentSeriesIdx]);
    updateSeriesIndicator();
  }, { passive: false });

  // Мобайл: свайп пальцем — переключение при отпускании
  let touchStartX   = null;
  let touchStartY   = null;
  let swipeIsHoriz  = false;

  scrubOverlay.addEventListener('touchstart', (e) => {
    touchStartX  = e.touches[0].clientX;
    touchStartY  = e.touches[0].clientY;
    swipeIsHoriz = false;
  }, { passive: true });

  scrubOverlay.addEventListener('touchmove', (e) => {
    if (touchStartX === null) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > dy + 5) {
      swipeIsHoriz = true;
      e.preventDefault(); // не скроллим страницу при горизонтальном свайпе
    }
  }, { passive: false });

  scrubOverlay.addEventListener('touchend', (e) => {
    if (touchStartX === null || !swipeIsHoriz || currentSeries.length <= 1) {
      touchStartX = null;
      return;
    }
    const deltaX = touchStartX - e.changedTouches[0].clientX;
    touchStartX  = null;
    swipeIsHoriz = false;
    if (Math.abs(deltaX) < 50) return; // слишком короткий — игнорируем
    currentSeriesIdx = deltaX > 0
      ? Math.min(currentSeriesIdx + 1, currentSeries.length - 1)
      : Math.max(currentSeriesIdx - 1, 0);
    showPhotoSrc(currentSeries[currentSeriesIdx]);
    updateSeriesIndicator();
  }, { passive: true });
}

/* ============================================
   КЛАВИАТУРА — стрелки листают серию
   ============================================ */
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (currentSeries.length <= 1) return;

    if (e.key === 'ArrowRight') {
      currentSeriesIdx = (currentSeriesIdx + 1) % currentSeries.length;
      showPhotoSrc(currentSeries[currentSeriesIdx]);
      updateSeriesIndicator();
    }

    if (e.key === 'ArrowLeft') {
      currentSeriesIdx =
        (currentSeriesIdx - 1 + currentSeries.length) % currentSeries.length;
      showPhotoSrc(currentSeries[currentSeriesIdx]);
      updateSeriesIndicator();
    }
  });
}

/* ============================================
   СОБЫТИЯ НА ЯЧЕЙКАХ
   Hover с задержкой + клик
   ============================================ */
function attachEventsBoth() {
  let hoverTimer = null;
  let lastCell   = null;

  function attachToColumn(col, cells, side) {

    col.addEventListener('pointermove', (e) => {
      const cell = e.target.closest('.cell');
      if (cell === lastCell) return;

      if (lastCell) {
        lastCell.classList.remove('is-active');
        clearTimeout(hoverTimer);
      }

      lastCell = cell;
      if (!cell) return;

      cell.classList.add('is-active');
      activeSide = side;
      activeIdx  = cells.indexOf(cell);

      preloadSeries(parseInt(cell.dataset.num));

      hoverTimer = setTimeout(() => {
        if (lastCell === cell) showPerson(parseInt(cell.dataset.num));
      }, CONFIG.hoverDelay);
    });

    col.addEventListener('pointerleave', () => {
      if (lastCell) {
        lastCell.classList.remove('is-active');
        lastCell = null;
      }
      clearTimeout(hoverTimer);
      if (activeSide === side) { activeIdx = -1; activeSide = null; }
    });

    col.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      clearTimeout(hoverTimer);
      showPerson(parseInt(cell.dataset.num));
    });
  }

  attachToColumn(colLeft,  cellsLeft,  'left');
  attachToColumn(colRight, cellsRight, 'right');
}

/* ============================================
   ПОЯВЛЕНИЕ ЯЧЕЙКИ — анимация scale
   ============================================ */
function revealCell(cell) {
  if (!cell.classList.contains('cell-hidden')) return;
  cell.classList.remove('cell-hidden');
  cell.classList.add('cell-visible');
}

/* ============================================
   ЗАГРУЗКА И ПОЯВЛЕНИЕ ЯЧЕЙКИ
   Сначала грузит картинку, потом показывает
   ============================================ */
function loadAndRevealCell(cell) {
  return new Promise((resolve) => {
    const img = cell.querySelector('img');

    // Уже загружена — сразу показываем
    if (img.src && img.complete && img.naturalWidth > 0) {
      revealCell(cell);
      resolve();
      return;
    }

    img.src = cell.dataset.src;
    img.decode()
      .then(() => { revealCell(cell); resolve(); })
      .catch(() => { revealCell(cell); resolve(); });
  });
}

/* ============================================
   ВОЛНОВОЙ ИНДЕКС ДЛЯ ПРАВОЙ СЕТКИ
   Считает порядок появления справа налево
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
   АНИМАЦИЯ ПЕРВОГО ЭКРАНА
   Левая — сверху вниз, правая — волной справа
   ============================================ */
function animateGrids() {
  const vh       = window.innerHeight;
  const gridLeft  = document.getElementById('grid-left');
  const gridRight = document.getElementById('grid-right');

  // Только ячейки в зоне видимости
  const visibleLeft = Array.from(gridLeft.querySelectorAll('.cell'))
    .filter(c => parseFloat(c.style.top) < vh);
  const visibleRight = Array.from(gridRight.querySelectorAll('.cell'))
    .filter(c => parseFloat(c.style.top) < vh);

  // Сортировка — сверху вниз, слева направо
  const sortTopDown = cells =>
    [...cells].sort((a, b) => {
      const d = parseFloat(a.style.top) - parseFloat(b.style.top);
      return d !== 0 ? d : parseFloat(a.style.left) - parseFloat(b.style.left);
    });

  // Сортировка — волна справа налево
  const sortByWave = cells =>
    [...cells].sort((a, b) => getWaveIndex(a) - getWaveIndex(b));

  // Запускаем с задержкой между ячейками
  const launch = (cells, startDelay) =>
    cells.forEach((cell, i) =>
      setTimeout(
        () => loadAndRevealCell(cell),
        startDelay + i * CONFIG.stepDelay
      )
    );

  launch(sortTopDown(visibleLeft),  0);
  launch(sortByWave(visibleRight),  CONFIG.stepDelay * 5);
}

/* ============================================
   SCROLL-АНИМАЦИЯ
   Ячейки появляются по строкам при скролле
   ============================================ */
function setupScrollAnimation(scrollEl, cells) {
  const rowMap = new Map();

  // Группируем ячейки по строкам
  cells.forEach(cell => {
    const cellH = parseFloat(cell.style.height) + CONFIG.cellGap;
    const row   = Math.round(parseFloat(cell.style.top) / cellH);
    if (!rowMap.has(row)) rowMap.set(row, []);
    rowMap.get(row).push(cell);
  });

  // Триггер — крайняя правая ячейка каждой строки
  const triggers = new Map();
  rowMap.forEach(rowCells => {
    const sorted = [...rowCells].sort(
      (a, b) => parseFloat(b.style.left) - parseFloat(a.style.left)
    );
    triggers.set(sorted[0], rowCells);
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const rowCells = triggers.get(entry.target);
      if (!rowCells) return;

      // Появление справа налево с задержкой
      [...rowCells]
        .sort((a, b) => parseFloat(b.style.left) - parseFloat(a.style.left))
        .forEach((cell, i) =>
          setTimeout(() => loadAndRevealCell(cell), i * CONFIG.scrollDelay)
        );

      observer.unobserve(entry.target);
    });
  }, { root: scrollEl, rootMargin: '0px', threshold: 0.1 });

  // Наблюдаем только за ячейками ниже экрана
  triggers.forEach((_, triggerCell) => {
    if (parseFloat(triggerCell.style.top) >= window.innerHeight)
      observer.observe(triggerCell);
  });

  return observer;
}

/* ============================================
   ЗАПУСТИТЬ SCROLL-АНИМАЦИЮ ДЛЯ ОБЕИХ СТОРОН
   ============================================ */
function setupScrollBoth() {
  if (observerLeft)  observerLeft.disconnect();
  if (observerRight) observerRight.disconnect();

  const gridLeft  = document.getElementById('grid-left');
  const gridRight = document.getElementById('grid-right');

  observerLeft = setupScrollAnimation(
    colLeft,  Array.from(gridLeft.querySelectorAll('.cell'))
  );
  observerRight = setupScrollAnimation(
    colRight, Array.from(gridRight.querySelectorAll('.cell'))
  );
}

/* ============================================
   СТАРТОВОЕ ФОТО В ЦЕНТРЕ
   ============================================ */
function loadFeaturedPhoto() {
  return new Promise(resolve => {
    const num = Math.floor(Math.random() * CONFIG.total) + 1;

    currentPersonId  = num;
    currentSeries    = PEOPLE_DATA[num].series;
    currentSeriesIdx = 0;

    // Готовим верхний слой
    layerTop.style.opacity = '0';
    layerTop.style.zIndex  = '2';
    layerBot.style.zIndex  = '1';

    // Подпись
    captionName.textContent = PEOPLE_DATA[num].name;
    document.getElementById('caption-day-num').textContent   = `${num}/`;
    document.getElementById('caption-day-total').textContent = '365';

    layerTop.onload = () => {
      layerTop.style.opacity = '1';
      updateSeriesIndicator();
      resolve();
    };
    layerTop.onerror = () => resolve();
    layerTop.src     = currentSeries[0];

    // Если уже в кэше браузера
    if (layerTop.complete && layerTop.naturalWidth > 0) {
      layerTop.style.opacity = '1';
      updateSeriesIndicator();
      resolve();
    }
  });
}

/* ============================================
   ОТКРЫТИЕ ШТОРОК НА ЦЕНТРАЛЬНОМ ФОТО
   ============================================ */
function animateFeaturedOpen(onComplete) {
  featuredWrap.classList.add('is-revealed');
  setTimeout(() => featuredEl.classList.add('is-open'), 100);

  gsap.fromTo(
    document.getElementById('featured-caption'),
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: 0.5, delay: 0.9, ease: 'power2.out' }
  );

  gsap.fromTo(logoLeft,
    { opacity: 0, y: -8 },
    { opacity: 1, y: 0, duration: 0.6, delay: 0.7, ease: 'power2.out' }
  );

  gsap.fromTo(logoRight,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.6, delay: 0.7, ease: 'power2.out' }
  );

  setTimeout(() => { if (onComplete) onComplete(); }, 1200);
}

/* ============================================
   RESIZE — пересчёт при изменении окна
   ============================================ */
let resizeTimer = null;

function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    applyLayout();
    if (isMobile()) {
      animateMobileGrid();
    } else {
      setupScrollBoth();
      animateGrids();
    }
  }, 200);
}

/* ============================================
   СИНХРОННЫЙ СКРОЛЛ БОКОВЫХ КОЛОНОК
   Скроллим одну — вторая повторяет
   ============================================ */
let isSyncingScroll = false;

function setupSyncScroll() {
  colLeft.addEventListener('scroll', () => {
    if (isSyncingScroll) return;
    isSyncingScroll    = true;
    colRight.scrollTop = colLeft.scrollTop;
    isSyncingScroll    = false;
  });

  colRight.addEventListener('scroll', () => {
    if (isSyncingScroll) return;
    isSyncingScroll   = true;
    colLeft.scrollTop = colRight.scrollTop;
    isSyncingScroll   = false;
  });
}

/* ============================================
   КОЛЕСО МЫШИ НАД ЦЕНТРОМ
   Курсор над центром — скроллим боковые
   ============================================ */
function setupWheelScroll() {
  colCenter.addEventListener('wheel', (e) => {
    e.preventDefault();
    colLeft.scrollTop  += e.deltaY;
    colRight.scrollTop += e.deltaY;
  }, { passive: false });
}

/* ============================================
   ИНИЦИАЛИЗАЦИЯ — главная функция запуска
   ============================================ */
async function init() {
  PEOPLE_DATA = buildPeopleData();
  applyLayout();
  await loadFeaturedPhoto();

  animateFeaturedOpen(() => {
    if (isMobile()) {
      animateMobileGrid();
    } else {
      animateGrids();
      setupScrollBoth();
    }
  });

  if (isMobile()) {
    attachMobileEvents();
  } else {
    attachEventsBoth();
  }

  setupScrubbing();
  setupKeyboard();
  window.addEventListener('resize', handleResize);
}

/* ============================================
   ЗАПУСК
   ============================================ */
document.addEventListener('DOMContentLoaded', init);