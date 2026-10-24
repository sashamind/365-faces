/* ============================================
   ПОДГОТОВКА ФОТО ИЗ photos/faces/ ДЛЯ САЙТА
   Запуск: npm install && npm run prepare-photos

   Берёт исходники (например, выгрузку из Instagram):
     photos/faces/
       025_Dasha/      ← день 25, имя «Dasha»
         любое-имя.jpg ← порядок — по имени файла
       026_/           ← можно без имени

   и для каждого дня пишет готовую папку:
     photos/025-Dasha/1.jpg, 2.jpg, ..., thumb.jpg

   Что делает с каждым фото:
   - срезает рамку-паспарту (белую, кремовую, цветную)
   - большое фото — в исходных пропорциях, вписано в 1200×1800, JPEG ~82
   - превью thumb.jpg — кадр 2:3 по центру, 400×600
   - выкидывает точные дубликаты

   Исходники в photos/faces/ в гит не попадают (.gitignore).
   ============================================ */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const sharp  = require('sharp');

const SRC_DIR = path.join(__dirname, 'photos', 'faces');
const OUT_DIR = path.join(__dirname, 'photos');
const IMG_RE  = /\.(jpe?g|png|webp|avif)$/i;

const OUT   = { width: 1200, height: 1800, quality: 82 };
const THUMB = { width: 400,  height: 600,  quality: 75 };

const FRAME_COLOR_TOL = 14; // строка — рамка, если её цвет близок к цвету угла…
const FRAME_NOISE_TOL = 10; // …и она почти однотонная (разброс каналов)
const MIN_FRAME       = 15; // рамка должна быть со всех сторон не тоньше, px
const EDGE_SHAVE      = 3;  // срезаем ещё чуть-чуть — убрать полоску на стыке

// Естественная сортировка: _2 раньше _10
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/* Рамка ли это: светлый или насыщенный цвет.
   Тёмный однотонный фон — это часть кадра, а не паспарту. */
function looksLikeFrame({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = max === 0 ? 0 : (max - min) / max;
  return lum > 0.6 || (sat > 0.4 && max > 100);
}

/* Прямоугольник фото внутри рамки или null, если рамки нет.
   Идём от каждого края внутрь, пока строка/столбец однотонные
   и того же цвета, что угол — так ловятся и неровные рамки. */
async function findFrame(buf, width, height) {
  const px = (x, y) => { const i = (y * width + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
  const corner = px(1, 1);
  if (!looksLikeFrame({ r: corner[0], g: corner[1], b: corner[2] })) return null;

  // Однотонна ли линия из n пикселей, совпадает ли с цветом рамки
  const isFrameLine = (n, get) => {
    const sum = [0, 0, 0], sq = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      const p = get(k);
      for (let c = 0; c < 3; c++) { sum[c] += p[c]; sq[c] += p[c] * p[c]; }
    }
    for (let c = 0; c < 3; c++) {
      const mean = sum[c] / n;
      const std  = Math.sqrt(Math.max(0, sq[c] / n - mean * mean));
      if (Math.abs(mean - corner[c]) > FRAME_COLOR_TOL || std > FRAME_NOISE_TOL) return false;
    }
    return true;
  };

  const maxX = Math.floor(width / 3), maxY = Math.floor(height / 3);
  let top = 0, bottom = 0, left = 0, right = 0;
  while (top    < maxY && isFrameLine(width,  x => px(x, top)))                top++;
  while (bottom < maxY && isFrameLine(width,  x => px(x, height - 1 - bottom))) bottom++;
  while (left   < maxX && isFrameLine(height, y => px(left, y)))               left++;
  while (right  < maxX && isFrameLine(height, y => px(width - 1 - right, y)))  right++;
  if (Math.min(left, top, right, bottom) < MIN_FRAME) return null;

  return {
    left:   left + EDGE_SHAVE,
    top:    top  + EDGE_SHAVE,
    width:  width  - left - right  - EDGE_SHAVE * 2,
    height: height - top  - bottom - EDGE_SHAVE * 2,
  };
}

async function processPhoto(src, dest) {
  const { data, info } = await sharp(src).rotate().removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const frame = await findFrame(data, info.width, info.height);
  const box   = frame || { left: 0, top: 0, width: info.width, height: info.height };

  // Большое фото не кадрируем — только рамку долой и вписать в 1200×1800
  await sharp(data, { raw: info })
    .extract(box)
    .resize(OUT.width, OUT.height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: OUT.quality, mozjpeg: true })
    .toFile(dest);
  return !!frame;
}

// Превью под ячейку сетки 2:3. Кадр по центру: портреты почти
// всегда центрованы, а «умный» attention цеплялся за серьги и блики
async function makeThumb(src, dest) {
  await sharp(src)
    .resize(THUMB.width, THUMB.height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: THUMB.quality, mozjpeg: true })
    .toFile(dest);
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.log('Нет папки photos/faces/ — нечего готовить');
    return;
  }

  for (const dir of fs.readdirSync(SRC_DIR).sort(natural)) {
    const srcDir = path.join(SRC_DIR, dir);
    if (!fs.statSync(srcDir).isDirectory()) continue;

    const m = dir.match(/^(\d{1,3})(?:[-_](.*))?$/);
    if (!m) { console.warn(`⚠ Пропущена «${dir}» — имя должно начинаться с номера дня`); continue; }
    const day  = parseInt(m[1], 10);
    const name = (m[2] || '').trim();
    if (day < 1 || day > 365) { console.warn(`⚠ Пропущена «${dir}» — день вне 1–365`); continue; }

    // Выкидываем точные дубликаты («фото (1).jpg» и т.п.)
    const seen  = new Set();
    const files = fs.readdirSync(srcDir).filter(f => IMG_RE.test(f)).sort(natural).filter(f => {
      const hash = crypto.createHash('md5').update(fs.readFileSync(path.join(srcDir, f))).digest('hex');
      if (seen.has(hash)) { console.log(`  · дубликат пропущен: ${dir}/${f}`); return false; }
      seen.add(hash);
      return true;
    });
    if (!files.length) continue;

    // Папка результата пересоздаётся целиком — исходник главный
    const outName = String(day).padStart(3, '0') + (name ? `-${name}` : '');
    const outDir  = path.join(OUT_DIR, outName);
    for (const old of fs.readdirSync(OUT_DIR)) {
      const mm = old.match(/^(\d{1,3})(?:[-_]|$)/);
      if (mm && parseInt(mm[1], 10) === day) fs.rmSync(path.join(OUT_DIR, old), { recursive: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    let framed = 0;
    for (let i = 0; i < files.length; i++) {
      if (await processPhoto(path.join(srcDir, files[i]), path.join(outDir, `${i + 1}.jpg`))) framed++;
    }
    await makeThumb(path.join(outDir, '1.jpg'), path.join(outDir, 'thumb.jpg'));

    console.log(`✓ ${outName}: ${files.length} фото, рамок срезано: ${framed}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
