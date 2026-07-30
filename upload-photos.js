/* ============================================
   ЗАЛИВКА ФОТО В SUPABASE
   Запуск: node upload-photos.js

   Читает локальную папку photos/, загружает файлы
   в бакет 365-faces и записывает строки в таблицу
   faces_365. Фотографии в гит не попадают.

   Структура папок:
     photos/
       025-Елена/     ← день 25, имя «Елена»
         1.jpg        ← серия по порядку: 1.jpg, 2.jpg...
         2.jpg
         thumb.jpg    ← (не обязательно) превью для сетки
       107/           ← можно без имени

   Нужен service_role ключ в .env (в гит не попадает):
     SUPABASE_SERVICE_KEY=eyJ...
   Взять тут: Supabase → Settings → API → service_role
   ============================================ */
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://kzzsmdgsjnkhtbzhjlyl.supabase.co';
const BUCKET       = '365-faces';
const TABLE        = 'faces_365';

const PHOTOS_DIR = path.join(__dirname, 'photos');
const IMG_RE     = /\.(jpe?g|png|webp|avif)$/i;

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp', '.avif': 'image/avif',
};

/* Читаем ключ из .env */
function readServiceKey() {
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY;

  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, 'utf8')
      .match(/^\s*SUPABASE_SERVICE_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }

  console.error(
    '✗ Нет service_role ключа.\n' +
    '  Создай файл .env рядом со скриптом:\n' +
    '    SUPABASE_SERVICE_KEY=eyJ...\n' +
    '  Ключ: Supabase → Settings → API → service_role'
  );
  process.exit(1);
}

const KEY = readServiceKey();

/* Загрузка одного файла в Storage */
async function uploadFile(localPath, storagePath) {
  const body = fs.readFileSync(localPath);
  const type = MIME[path.extname(localPath).toLowerCase()] || 'application/octet-stream';

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${KEY}`,
        'Content-Type': type,
        'x-upsert':     'true', // перезаливка поверх существующего
      },
      body,
    }
  );

  if (!res.ok) throw new Error(`${storagePath}: ${res.status} ${await res.text()}`);
}

/* Запись строк в таблицу */
async function upsertRows(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey:         KEY,
      Authorization:  `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) throw new Error(`Таблица: ${res.status} ${await res.text()}`);
}

/* ============================================ */
async function main() {
  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error('✗ Нет папки photos/');
    process.exit(1);
  }

  const rows = [];

  for (const dir of fs.readdirSync(PHOTOS_DIR).sort()) {
    const fullDir = path.join(PHOTOS_DIR, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;

    // «025-Елена», «025_Елена» или просто «025»
    const m = dir.match(/^(\d{1,3})(?:[-_](.+))?$/);
    if (!m) {
      console.warn(`⚠ «${dir}» — имя папки должно начинаться с номера дня, пропуск`);
      continue;
    }

    const id = parseInt(m[1], 10);
    if (id < 1 || id > 365) {
      console.warn(`⚠ «${dir}» — номер дня вне 1–365, пропуск`);
      continue;
    }

    const files  = fs.readdirSync(fullDir).filter(f => IMG_RE.test(f));
    const series = files
      .filter(f => /^\d+\./.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));

    if (!series.length) {
      console.warn(`⚠ «${dir}» — нет файлов вида 1.jpg, 2.jpg…, пропуск`);
      continue;
    }

    const folder    = String(id).padStart(3, '0');
    const thumbFile = files.find(f => /^thumb\./i.test(f));
    const toUpload  = thumbFile ? [...series, thumbFile] : series;

    for (const f of toUpload) {
      await uploadFile(path.join(fullDir, f), `${folder}/${f}`);
    }

    const row = { id, series: series.map(f => `${folder}/${f}`) };
    const name = (m[2] || '').trim();
    if (name)      row.name  = name;
    if (thumbFile) row.thumb = `${folder}/${thumbFile}`;

    rows.push(row);
    console.log(`✓ День ${id}${name ? ` (${name})` : ''} — ${toUpload.length} файлов`);
  }

  if (!rows.length) {
    console.log('Нечего загружать.');
    return;
  }

  await upsertRows(rows);
  console.log(`\n✓ Готово: ${rows.length} записей в Supabase`);
}

main().catch(err => {
  console.error('✗', err.message);
  process.exit(1);
});
