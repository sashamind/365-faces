/* ============================================
   ГЕНЕРАТОР people.json ИЗ ПАПКИ photos/
   Запуск: node generate-data.js
   (на GitHub запускается автоматически при пуше —
   см. .github/workflows/generate-data.yml)

   Структура папок:
     photos/
       025-Елена/     ← день 25, имя «Елена»
         1.jpg        ← серия: 1.jpg, 2.jpg, ... по порядку
         2.jpg
         thumb.jpg    ← (не обязательно) превью для сетки
       107/           ← можно без имени
         1.jpg

   Имя после номера — через дефис или подчёркивание.
   Форматы: jpg, jpeg, png, webp, avif.
   ============================================ */
const fs   = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, 'photos');
const OUT_FILE   = path.join(__dirname, 'people.json');
const IMG_RE     = /\.(jpe?g|png|webp|avif)$/i;

const result = {};

if (fs.existsSync(PHOTOS_DIR)) {
  for (const dir of fs.readdirSync(PHOTOS_DIR).sort()) {
    const fullDir = path.join(PHOTOS_DIR, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;

    // Имя папки: «025-Елена», «025_Елена» или просто «025»
    const m = dir.match(/^(\d{1,3})(?:[-_](.+))?$/);
    if (!m) {
      console.warn(`⚠ Пропущена папка «${dir}» — имя должно начинаться с номера дня`);
      continue;
    }
    const id = parseInt(m[1], 10);
    if (id < 1 || id > 365) {
      console.warn(`⚠ Пропущена папка «${dir}» — номер дня вне диапазона 1–365`);
      continue;
    }

    const files  = fs.readdirSync(fullDir).filter(f => IMG_RE.test(f));
    const series = files
      .filter(f => /^\d+\./.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(f => `photos/${dir}/${f}`);

    if (series.length === 0) {
      console.warn(`⚠ Пропущена папка «${dir}» — нет файлов вида 1.jpg, 2.jpg...`);
      continue;
    }

    const entry = { series };

    const name = (m[2] || '').trim();
    if (name) entry.name = name;

    const thumbFile = files.find(f => /^thumb\./i.test(f));
    if (thumbFile) entry.thumb = `photos/${dir}/${thumbFile}`;

    result[id] = entry;
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n');
console.log(`✓ people.json: ${Object.keys(result).length} записей`);
