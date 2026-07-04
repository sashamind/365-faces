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
   ДАННЫЕ О ЛЮДЯХ — заглушки picsum
   ============================================ */
function buildPeopleData() {
  const data = {};
  for (let id = 1; id <= CONFIG.total; id++) {
    const seriesCount = 2 + (id % 5);
    const series = [];
    for (let s = 1; s <= seriesCount; s++) {
      series.push(`https://picsum.photos/seed/${id * 100 + s}/800/1200`);
    }
    data[id] = { id, name: NAMES[id % NAMES.length], series, real: false };
  }
  return data;
}

/* ============================================
   РЕАЛЬНЫЕ ДАННЫЕ — people.json
   Генерируется автоматически из папки photos/
   (см. generate-data.js). Найденные записи
   перекрывают заглушки, остальные дни — picsum.
   ============================================ */
async function loadRealData() {
  try {
    const res = await fetch('people.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const real = await res.json();
    Object.entries(real).forEach(([id, p]) => {
      const num = parseInt(id);
      if (!PEOPLE_DATA[num] || !p.series || !p.series.length) return;
      PEOPLE_DATA[num] = {
        id:     num,
        name:   p.name || PEOPLE_DATA[num].name,
        series: p.series,
        thumb:  p.thumb || null,
        real:   true,
      };
    });
  } catch (_) {
    // people.json нет — работаем на заглушках
  }
}

/* ============================================
   ПРЕВЬЮ ДЛЯ ЯЧЕЙКИ СЕТКИ
   Реальное фото: thumb.jpg или первое из серии,
   заглушка: picsum нужного размера
   ============================================ */
function thumbSrc(photoNum, w, h) {
  const p = PEOPLE_DATA[photoNum];
  if (p && p.real) return p.thumb || p.series[0];
  return `https://picsum.photos/seed/${photoNum * 100 + 1}/${w}/${h}`;
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
let cellsMobile = [];

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
   ПОРЯДОК СЕТКИ — перемешивается один раз,
   при resize порядок сохраняется
   ============================================ */
let shuffledIndices = null;

function getShuffledIndices() {
  if (!shuffledIndices) {
    shuffledIndices = Array.from({ length: CONFIG.total }, (_, i) => i + 1);
    shuffleArray(shuffledIndices);
  }
  return shuffledIndices;
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
    cell.dataset.src = thumbSrc(photoNum, cellW * 2, cellH * 2);

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


  // Строим сетки — порядок стабилен между resize
  const indices = getShuffledIndices();

  const leftCount    = Math.ceil(CONFIG.total / 2);
  const leftIndices  = indices.slice(0, leftCount);
  const rightIndices = indices.slice(leftCount);

  const gridLeft  = document.getElementById('grid-left');
  const gridRight = document.getElementById('grid-right');

  buildSideGridFromArray(gridLeft,  leftIndices,  cols, cellW, cellH);
  buildSideGridFromArray(gridRight, rightIndices, cols, cellW, cellH);
}

/* ============================================
   МОБИЛЬНЫЙ LAYOUT
   ============================================ */
function applyMobileLayout() {
  colCenter.style.left    = '';
  colCenter.style.width   = '';
  featuredEl.style.height = '';
  // Карусель строится в loadFeaturedPhoto / showPerson — сетка после неё
  if (currentSeries.length > 0) {
    buildCarousel(currentSeries, currentSeriesIdx);
  }
}

/* ============================================
   МОБИЛЬНАЯ СЕТКА — 2 ряда, горизонтальный скролл
   ============================================ */
function buildMobileGrid() {
  const colBottom  = document.getElementById('col-bottom');
  const gridEl     = document.getElementById('grid-mobile');
  const gap        = 4;
  const appH       = document.getElementById('app').offsetHeight || window.innerHeight;
  const containerH = colBottom.offsetHeight || Math.round(appH * 0.37);

  // Реальные паддинги из CSS — учитывают env(safe-area-inset-bottom)
  const cs   = getComputedStyle(gridEl);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

  const cellH = Math.floor((containerH - padY - gap) / 2);
  const cellW = Math.round(cellH * CONFIG.photoAspect);

  gridEl.innerHTML = '';
  gridEl.style.gridAutoColumns   = cellW + 'px';
  gridEl.style.gridTemplateRows  = `repeat(2, ${cellH}px)`;

  const indices = getShuffledIndices();

  cellsMobile = indices.map(photoNum => {
    const cell       = document.createElement('div');
    cell.className   = 'cell cell-hidden';
    cell.dataset.num = photoNum;
    cell.dataset.src = thumbSrc(photoNum, cellW * 2, cellH * 2);

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
  let activeCell  = null;

  // Предзагрузка серии уже при касании — выигрываем ~100мс до клика
  colBottom.addEventListener('touchstart', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) preloadSeries(parseInt(cell.dataset.num));
  }, { passive: true });

  colBottom.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;

    if (activeCell) activeCell.classList.remove('is-active');
    activeCell = cell;
    cell.classList.add('is-active');

    showPerson(parseInt(cell.dataset.num));
  });
}

/* ============================================
   МОБИЛЬНАЯ АНИМАЦИЯ СЕТКИ
   IntersectionObserver по горизонтальному скроллу
   ============================================ */
let observerMobile = null;

function animateMobileGrid() {
  if (observerMobile) observerMobile.disconnect();

  const colBottom = document.getElementById('col-bottom');
  observerMobile  = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      loadAndRevealCell(entry.target);
      observerMobile.unobserve(entry.target);
    });
    // rootMargin по горизонтали — грузим заранее при скролле ленты
  }, { root: colBottom, rootMargin: '0px 400px', threshold: 0.1 });

  cellsMobile.forEach(cell => observerMobile.observe(cell));
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
  const dayNum    = document.getElementById('caption-day-num');
  const dayTotal  = document.getElementById('caption-day-total');
  const captionDay = document.getElementById('caption-day');

  if (captionName.textContent === name &&
      dayNum.textContent === `${day}/`) return;

  const targets = [captionName, captionDay];
  gsap.to(targets, {
    opacity: 0, y: 4, duration: 0.15, ease: 'power2.in',
    onComplete: () => {
      captionName.textContent = name;
      dayNum.textContent      = `${day}/`;
      dayTotal.textContent    = '365';
      gsap.to(targets, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
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

  // Дип-линк: день можно шарить ссылкой вида .../#25
  history.replaceState(null, '', '#' + personId);

  updateCaption(person.name, personId);

  if (isMobile()) {
    // Ждём загрузку первого фото — чтобы карусель не мигала серым
    preloadSeries(personId);
    const firstImg = preloadCache[currentSeries[0]];
    let built = false;
    const build = () => {
      if (built || currentPersonId !== personId) return;
      built = true;
      buildCarousel(currentSeries, 0);
    };

    if (firstImg.complete && firstImg.naturalWidth > 0) {
      build();
    } else {
      firstImg.addEventListener('load',  build, { once: true });
      firstImg.addEventListener('error', build, { once: true });
      setTimeout(build, 800); // фолбэк на медленной сети
    }
  } else {
    showPhotoSrc(currentSeries[0]);
  }

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

  // Единая модель листания: пошагово — клик, тачпад, стрелки, свайп.
  // Скрабинг позицией мыши убран: он затирал выбор,
  // сделанный колесом/стрелками, при любом сдвиге курсора.

  // Десктоп: клик по фото — следующее в серии (по кругу)
  scrubOverlay.addEventListener('click', () => {
    if (currentSeries.length <= 1) return;
    currentSeriesIdx = (currentSeriesIdx + 1) % currentSeries.length;
    showPhotoSrc(currentSeries[currentSeriesIdx]);
    updateSeriesIndicator();
  });

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
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

    currentSeriesIdx = e.key === 'ArrowRight'
      ? (currentSeriesIdx + 1) % currentSeries.length
      : (currentSeriesIdx - 1 + currentSeries.length) % currentSeries.length;

    // Мобильная раскладка: двигаем карусель, а не скрытый crossfade
    if (isMobile()) {
      positionCarousel(currentSeriesIdx, true);
    } else {
      showPhotoSrc(currentSeries[currentSeriesIdx]);
    }
    updateSeriesIndicator();
  });
}

/* ============================================
   СОБЫТИЯ НА ЯЧЕЙКАХ
   Hover с задержкой + клик
   ============================================ */
function attachEventsBoth() {
  let hoverTimer = null;
  let lastCell   = null;

  function attachToColumn(col) {

    col.addEventListener('pointermove', (e) => {
      // На таче (iPad в десктопной раскладке) hover-задержка
      // не нужна — работает обычный тап через click
      if (e.pointerType === 'touch') return;

      const cell = e.target.closest('.cell');
      if (cell === lastCell) return;

      if (lastCell) {
        lastCell.classList.remove('is-active');
        clearTimeout(hoverTimer);
      }

      lastCell = cell;
      if (!cell) return;

      cell.classList.add('is-active');
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
    });

    col.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      clearTimeout(hoverTimer);
      showPerson(parseInt(cell.dataset.num));
    });
  }

  attachToColumn(colLeft);
  attachToColumn(colRight);
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
    // rootMargin 400px — грузим заранее, до входа в зону видимости
  }, { root: scrollEl, rootMargin: '400px 0px', threshold: 0.1 });

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
    // Дип-линк #25 — открываем этот день, иначе случайный
    const hashNum = parseInt((location.hash || '').slice(1));
    const num = (hashNum >= 1 && hashNum <= CONFIG.total)
      ? hashNum
      : Math.floor(Math.random() * CONFIG.total) + 1;

    currentPersonId  = num;
    currentSeries    = PEOPLE_DATA[num].series;
    currentSeriesIdx = 0;

    captionName.textContent = PEOPLE_DATA[num].name;
    document.getElementById('caption-day-num').textContent   = `${num}/`;
    document.getElementById('caption-day-total').textContent = '365';

    // Мобайл: строим карусель, crossfade не нужен
    if (isMobile()) {
      buildCarousel(currentSeries, 0);
      updateSeriesIndicator();
      resolve();
      return;
    }

    // Десктоп: crossfade слои
    layerTop.style.opacity = '0';
    layerTop.style.zIndex  = '2';
    layerBot.style.zIndex  = '1';

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      layerTop.style.opacity = '1';
      updateSeriesIndicator();
      resolve();
    };

    layerTop.onload  = finish;
    layerTop.onerror = () => { if (!done) { done = true; resolve(); } };
    layerTop.src     = currentSeries[0];

    if (layerTop.complete && layerTop.naturalWidth > 0) finish();
  });
}

/* ============================================
   ОТКРЫТИЕ ШТОРОК НА ЦЕНТРАЛЬНОМ ФОТО
   ============================================ */
function animateFeaturedOpen(onComplete) {
  const mobile = isMobile();
  const delay  = mobile ? 0.1 : 0.7;

  if (!mobile) {
    featuredWrap.classList.add('is-revealed');
    setTimeout(() => featuredEl.classList.add('is-open'), 100);
  }

  gsap.fromTo(
    document.getElementById('featured-footer'),
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: 0.5, delay: mobile ? 0.2 : 0.9, ease: 'power2.out' }
  );

  gsap.fromTo(logoLeft,
    { opacity: 0, y: -8 },
    { opacity: 1, y: 0, duration: 0.6, delay, ease: 'power2.out' }
  );

  gsap.fromTo(logoRight,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.6, delay, ease: 'power2.out' }
  );

  setTimeout(() => { if (onComplete) onComplete(); }, mobile ? 500 : 1200);
}

/* ============================================
   RESIZE — пересчёт при изменении окна
   ============================================ */
let resizeTimer   = null;
let lastViewportW = window.innerWidth;

function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // На мобиле высота прыгает при сворачивании браузерного бара —
    // пересобираем только если изменилась ширина (поворот экрана)
    const widthChanged = window.innerWidth !== lastViewportW;
    if (isMobile() && !widthChanged) return;
    lastViewportW = window.innerWidth;

    applyLayout(); // на мобайле пересоздаёт карусель если серия есть
    if (isMobile()) {
      buildMobileGrid();   // сетка ПОСЛЕ карусели — offsetHeight корректный
      animateMobileGrid();
    } else {
      // Если пришли с мобильной раскладки — crossfade-слои пустые, шторки закрыты
      if (!layerTop.src && currentSeries.length > 0) {
        layerTop.src = currentSeries[currentSeriesIdx];
      }
      featuredWrap.classList.add('is-revealed');
      featuredEl.classList.add('is-open');
      setupScrollBoth();
      animateGrids();
    }
  }, 200);
}

/* ============================================
   КАРУСЕЛЬ — расчёт размеров
   ============================================ */
function getCarouselMetrics() {
  const vw      = window.innerWidth;
  // Высота от #app (100lvh) — не зависит от состояния Safari-бара
  const appH    = document.getElementById('app').offsetHeight || window.innerHeight;
  const maxH    = Math.round(appH * 0.52);
  const vwRatio = vw <= 480 ? 0.80 : 0.65;
  let slideW = Math.round(vw * vwRatio);
  let slideH = Math.round(slideW / CONFIG.photoAspect);
  if (slideH > maxH) { slideH = maxH; slideW = Math.round(slideH * CONFIG.photoAspect); }
  return { slideW, slideH, gap: 16 };
}

/* ============================================
   КАРУСЕЛЬ — строим слайды (нативный scroll-snap)
   Outer имеет точную ширину слайда — браузер
   сам центрирует и обеспечивает резину на краях
   ============================================ */
function buildCarousel(series, idx) {
  const { slideW, slideH, gap } = getCarouselMetrics();
  const outer = document.getElementById('carousel-outer');

  outer.style.width  = slideW + 'px';
  outer.style.height = slideH + 'px';
  outer.style.gap    = gap + 'px';
  outer.innerHTML    = '';

  series.forEach(src => {
    const slide       = document.createElement('div');
    slide.className   = 'carousel-slide';
    slide.style.width  = slideW + 'px';
    slide.style.height = slideH + 'px';
    const img         = document.createElement('img');
    img.src = src; img.alt = '';
    slide.appendChild(img);
    outer.appendChild(slide);
  });

  // Логотипы и подпись выравниваем по ширине фото
  const footer  = document.getElementById('featured-footer');
  const logoHdr = document.getElementById('logos-header');
  footer.style.width  = slideW + 'px';
  footer.style.margin = '6px auto 0';
  logoHdr.style.width = slideW + 'px';

  outer.scrollLeft = idx * (slideW + gap);
}

/* ============================================
   КАРУСЕЛЬ — прокрутить к слайду
   ============================================ */
function positionCarousel(idx, animate) {
  const outer = document.getElementById('carousel-outer');
  if (!outer) return;
  const { slideW, gap } = getCarouselMetrics();
  const target = idx * (slideW + gap);
  if (animate) {
    outer.scrollTo({ left: target, behavior: 'smooth' });
  } else {
    outer.scrollLeft = target;
  }
}

/* ============================================
   КАРУСЕЛЬ — синхронизируем индикатор со скроллом
   ============================================ */
function setupCarouselScroll() {
  const outer = document.getElementById('carousel-outer');
  if (!outer || outer._scrollReady) return;
  outer._scrollReady = true;

  let timer = null;
  outer.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { slideW, gap } = getCarouselMetrics();
      const newIdx = Math.max(0, Math.min(
        currentSeries.length - 1,
        Math.round(outer.scrollLeft / (slideW + gap))
      ));
      if (newIdx !== currentSeriesIdx) {
        currentSeriesIdx = newIdx;
        updateSeriesIndicator();
      }
    }, 80);
  }, { passive: true });

  // Тап по фото — следующий слайд (по кругу).
  // После свайпа click не срабатывает, конфликта со скроллом нет
  outer.addEventListener('click', () => {
    if (currentSeries.length <= 1) return;
    currentSeriesIdx = (currentSeriesIdx + 1) % currentSeries.length;
    positionCarousel(currentSeriesIdx, true);
    updateSeriesIndicator();
  });
}

/* ============================================
   ИНИЦИАЛИЗАЦИЯ — главная функция запуска
   ============================================ */
async function init() {
  // Системное «уменьшить движение» — ускоряем GSAP-анимации до мгновенных
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.globalTimeline.timeScale(100);
  }

  PEOPLE_DATA = buildPeopleData();
  await loadRealData(); // реальные фото из photos/ перекрывают заглушки
  applyLayout();
  await loadFeaturedPhoto();

  // На мобайле сетку строим ПОСЛЕ карусели (нужен корректный offsetHeight col-bottom)
  if (isMobile()) buildMobileGrid();

  animateFeaturedOpen(() => {
    if (isMobile()) {
      animateMobileGrid();
    } else {
      animateGrids();
      setupScrollBoth();
    }
  });

  // Все обработчики через делегирование на контейнеры —
  // вешаем сразу оба набора, чтобы переход через брейкпоинт
  // (resize через 900px) не оставлял UI без событий
  attachEventsBoth();
  attachMobileEvents();
  setupCarouselScroll();

  setupScrubbing();
  setupKeyboard();
  window.addEventListener('resize', handleResize);
}

/* ============================================
   ЗАПУСК
   ============================================ */
document.addEventListener('DOMContentLoaded', init);