/* ============================================
   КОНФИГУРАЦИЯ
   ============================================ */
const TOTAL = 365;                 // количество ячеек = дней в году
const grid = document.getElementById('grid');
const caption = document.getElementById('caption');
const captionIndex = caption.querySelector('.caption-index');
const captionName = caption.querySelector('.caption-name');

/* ============================================
   ИМЕНА (placeholder, потом заменишь на реальные)
   ============================================ */
const FIRST_NAMES = [
  'Anna', 'Mark', 'Lena', 'Ivan', 'Sasha', 'Maria', 'Daniel', 'Sofia',
  'Yulia', 'Artem', 'Nina', 'Oleg', 'Vera', 'Roman', 'Elena', 'Pavel',
  'Kira', 'Boris', 'Tanya', 'Alex', 'Maya', 'Igor', 'Liza', 'Mikhail'
];

/* Случайное имя для placeholder'а */
function randomName() {
  return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
}

/* ============================================
   ИСТОЧНИК ИЗОБРАЖЕНИЯ
   ============================================
   Сейчас используем сервис Picsum (случайные фото из интернета).
   Когда у тебя появятся свои фото в /images:
   1) положи их в папку /images с именами 001.jpg ... 365.jpg
   2) замени функцию ниже на:
      return `images/${String(i).padStart(3, '0')}.jpg`;
*/
function getImageUrl(i) {
  // seed=i — каждое число даёт стабильное, но РАЗНОЕ изображение
  return `https://picsum.photos/seed/face${i}/300/400`;
}

/* ============================================
   FISHER-YATES SHUFFLE
   Перемешивает массив случайно
   ============================================ */
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================
   СОЗДАНИЕ СЕТКИ
   ============================================ */
const indices = Array.from({ length: TOTAL }, (_, i) => i + 1); // 1..365
const shuffled = shuffle(indices);                              // случайный порядок

const cells = [];

shuffled.forEach((number) => {
  const cell = document.createElement('div');
  cell.className = 'cell';

  // Сохраняем данные о портрете прямо на элементе
  cell.dataset.index = number;
  cell.dataset.name = randomName();

  const img = document.createElement('img');
  img.src = getImageUrl(number);
  img.alt = `Face ${number}`;
  img.loading = 'lazy';            // ленивая загрузка — браузер не грузит всё сразу

  cell.appendChild(img);
  grid.appendChild(cell);
  cells.push(cell);
});

/* ============================================
   СТАРТОВАЯ АНИМАЦИЯ (GSAP)
   ============================================
   Все ячейки плавно появляются волной из центра.
*/
gsap.to('.cell', {
  opacity: 1,
  scale: 1,
  duration: 1.2,
  ease: 'power2.out',
  stagger: {
    each: 0.003,
    from: 'random'                 // появление в случайном порядке
  }
});

/* ============================================
   АВТО-ВЫДЕЛЕНИЕ СЛУЧАЙНОЙ ЯЧЕЙКИ
   ============================================ */
function autoFeature() {
  const randomCell = cells[Math.floor(Math.random() * cells.length)];
  randomCell.classList.add('featured');

  // Показать подпись по центру этой ячейки
  const rect = randomCell.getBoundingClientRect();
  showCaption(
    rect.left + rect.width / 2,
    rect.top,
    randomCell.dataset.index,
    randomCell.dataset.name
  );

  // Через ~3.5 сек снять выделение и спрятать подпись
  setTimeout(() => {
    randomCell.classList.remove('featured');
    hideCaption();
  }, 3500);
}

// Запускаем после того, как сетка успела появиться
setTimeout(autoFeature, 1800);

/* ============================================
   ПОДПИСЬ
   ============================================ */
function showCaption(x, y, index, name) {
  captionIndex.textContent = String(index).padStart(3, '0') + ' / 365';
  captionName.textContent = name;
  gsap.to(caption, {
    x: x,
    y: y,
    opacity: 1,
    duration: 0.4,
    ease: 'power2.out'
  });
}

function moveCaption(x, y) {
  gsap.to(caption, {
    x: x,
    y: y,
    duration: 0.3,
    ease: 'power2.out'
  });
}

function hideCaption() {
  gsap.to(caption, {
    opacity: 0,
    duration: 0.3,
    ease: 'power2.out'
  });
}

/* ============================================
   HOVER НА ЯЧЕЙКАХ
   ============================================ */
cells.forEach((cell) => {
  cell.addEventListener('mouseenter', (e) => {
    const rect = cell.getBoundingClientRect();
    showCaption(
      rect.left + rect.width / 2,
      rect.top,
      cell.dataset.index,
      cell.dataset.name
    );
  });

  cell.addEventListener('mousemove', (e) => {
    const rect = cell.getBoundingClientRect();
    moveCaption(rect.left + rect.width / 2, rect.top);
  });

  cell.addEventListener('mouseleave', () => {
    hideCaption();
  });
});

/* ============================================
   ЛЁГКИЙ PARALLAX ЭФФЕКТ
   ============================================
   Сетка очень мягко смещается за курсором — кинематографичное дыхание.
*/
const parallaxStrength = 15;       // сила сдвига в px (чем больше — тем заметнее)

window.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * parallaxStrength;
  const y = (e.clientY / window.innerHeight - 0.5) * parallaxStrength;

  gsap.to(grid, {
    x: -x,
    y: -y,
    duration: 1.2,
    ease: 'power2.out'
  });
});

/* ============================================
   FLOATING — еле заметное «дыхание» сетки
   ============================================ */
gsap.to(grid, {
  scale: 1.01,
  duration: 6,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1
});