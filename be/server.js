const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Разрешаем запросы со страницы, открытой не через этот сервер (например, Live Server)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ БД SQLITE
// ==========================================
const db = new DatabaseSync(path.join(__dirname, 'database.sqlite'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'attribute',
    photoUrl TEXT DEFAULT '',
    quantity INTEGER DEFAULT 1,
    description TEXT DEFAULT '',
    note TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    durationMinutes INTEGER NOT NULL,
    description TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS activity_items (
    activity_id INTEGER,
    item_id INTEGER,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    PRIMARY KEY (activity_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS plots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    canvasData TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS plot_activities (
    plot_id INTEGER,
    activity_id INTEGER,
    FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    PRIMARY KEY (plot_id, activity_id)
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    targetDuration INTEGER DEFAULT 60,
    plotsData TEXT DEFAULT '[]',
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// Миграции колонок при перезапуске
try { db.exec(`ALTER TABLE items ADD COLUMN type TEXT DEFAULT 'attribute'`); } catch (e) {}
try { db.exec(`ALTER TABLE activities ADD COLUMN description TEXT DEFAULT ''`); } catch (e) {}
try { db.exec(`ALTER TABLE plots ADD COLUMN canvasData TEXT DEFAULT ''`); } catch (e) {}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function toPositiveInt(value, fallback) {
  const num = Math.floor(Number(value));
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(n => Number.isInteger(n) && n > 0))];
}

// ==========================================
// 2. НАСТРОЙКА ХРАНИЛИЩА ФАЙЛОВ
// ==========================================
const uploadDir = path.join(__dirname, '../sourse/pic');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Можно загружать только изображения'));
  }
});

function removePhotoFile(photoUrl) {
  if (!photoUrl) return;
  const filePath = path.join(__dirname, '..', photoUrl);
  if (filePath.startsWith(uploadDir) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

app.use(express.static(path.join(__dirname, '../code')));
app.use('/sourse/pic', express.static(uploadDir));

// ==========================================
// 3. REST API РОУТЫ
// ==========================================

// --- ПРЕДМЕТЫ (ITEMS) ---
const selectItem = db.prepare('SELECT id AS _id, name, COALESCE(type, \'attribute\') AS type, photoUrl, quantity, description, note FROM items WHERE id = ?');

app.get('/api/items', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT i.id AS _id, i.name, COALESCE(i.type, 'attribute') AS type, i.photoUrl, i.quantity, i.description, i.note,
             (SELECT COUNT(*) FROM activity_items ai WHERE ai.item_id = i.id) AS usedIn
      FROM items i
      ORDER BY i.id DESC
    `).all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', upload.single('photo'), (req, res) => {
  try {
    const name = cleanText(req.body.name);
    if (!name) {
      if (req.file) removePhotoFile(`/sourse/pic/${req.file.filename}`);
      return res.status(400).json({ error: 'Укажите название предмета' });
    }
    const type = cleanText(req.body.type) === 'material' ? 'material' : 'attribute';
    const photoUrl = req.file ? `/sourse/pic/${req.file.filename}` : '';

    const info = db.prepare(`
      INSERT INTO items (name, type, photoUrl, quantity, description, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, type, photoUrl, toPositiveInt(req.body.quantity, 1), cleanText(req.body.description), cleanText(req.body.note));

    res.status(201).json(selectItem.get(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/items/:id', upload.single('photo'), (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Предмет не найден' });

    const name = cleanText(req.body.name);
    if (!name) return res.status(400).json({ error: 'Укажите название предмета' });

    const type = req.body.type ? (cleanText(req.body.type) === 'material' ? 'material' : 'attribute') : (item.type || 'attribute');

    let photoUrl = item.photoUrl;
    if (req.file) {
      removePhotoFile(item.photoUrl);
      photoUrl = `/sourse/pic/${req.file.filename}`;
    } else if (req.body.removePhoto === 'true') {
      removePhotoFile(item.photoUrl);
      photoUrl = '';
    }

    db.prepare(`
      UPDATE items SET name = ?, type = ?, photoUrl = ?, quantity = ?, description = ?, note = ? WHERE id = ?
    `).run(name, type, photoUrl, toPositiveInt(req.body.quantity, 1), cleanText(req.body.description), cleanText(req.body.note), item.id);

    res.json(selectItem.get(item.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    if (item) {
      db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
      removePhotoFile(item.photoUrl);
    }
    res.json({ message: 'Предмет успешно удален' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- АКТИВНОСТИ (ACTIVITIES) ---
const selectActivityItems = db.prepare(`
  SELECT i.id AS _id, i.name, COALESCE(i.type, 'attribute') AS type, i.photoUrl, i.quantity
  FROM items i
  JOIN activity_items ai ON i.id = ai.item_id
  WHERE ai.activity_id = ?
  ORDER BY i.name
`);

function getActivity(id) {
  const act = db.prepare('SELECT id AS _id, title, durationMinutes, description FROM activities WHERE id = ?').get(id);
  return act ? { ...act, items: selectActivityItems.all(act._id) } : null;
}

function setActivityItems(activityId, itemIds) {
  db.prepare('DELETE FROM activity_items WHERE activity_id = ?').run(activityId);
  const insert = db.prepare('INSERT OR IGNORE INTO activity_items (activity_id, item_id) SELECT ?, id FROM items WHERE id = ?');
  for (const itemId of itemIds) insert.run(activityId, itemId);
}

app.get('/api/activities', (req, res) => {
  try {
    const activities = db.prepare('SELECT id AS _id, title, durationMinutes, description FROM activities ORDER BY id DESC').all();
    res.json(activities.map(act => ({ ...act, items: selectActivityItems.all(act._id) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activities', (req, res) => {
  try {
    const title = cleanText(req.body.title);
    if (!title) return res.status(400).json({ error: 'Укажите название активности' });

    const id = transaction(() => {
      const info = db.prepare('INSERT INTO activities (title, durationMinutes, description) VALUES (?, ?, ?)')
        .run(title, toPositiveInt(req.body.durationMinutes, 15), cleanText(req.body.description));
      setActivityItems(info.lastInsertRowid, toIdList(req.body.items));
      return info.lastInsertRowid;
    });

    res.status(201).json(getActivity(id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/activities/:id', (req, res) => {
  try {
    const existing = getActivity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Активность не найдена' });

    const title = cleanText(req.body.title);
    if (!title) return res.status(400).json({ error: 'Укажите название активности' });

    transaction(() => {
      db.prepare('UPDATE activities SET title = ?, durationMinutes = ?, description = ? WHERE id = ?')
        .run(title, toPositiveInt(req.body.durationMinutes, 15), cleanText(req.body.description), existing._id);
      setActivityItems(existing._id, toIdList(req.body.items));
    });

    res.json(getActivity(existing._id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/activities/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
    res.json({ message: 'Активность успешно удалена' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- СЮЖЕТЫ (PLOTS) ---
const selectPlotActivities = db.prepare(`
  SELECT a.id AS _id, a.title, a.durationMinutes, a.description
  FROM activities a
  JOIN plot_activities pa ON a.id = pa.activity_id
  WHERE pa.plot_id = ?
  ORDER BY a.title
`);

function getPlot(id) {
  const plot = db.prepare('SELECT id AS _id, title, description, canvasData FROM plots WHERE id = ?').get(id);
  if (!plot) return null;
  const activities = selectPlotActivities.all(plot._id).map(act => ({
    ...act,
    items: selectActivityItems.all(act._id)
  }));
  return { ...plot, activities };
}

function setPlotActivities(plotId, activityIds) {
  db.prepare('DELETE FROM plot_activities WHERE plot_id = ?').run(plotId);
  const insert = db.prepare('INSERT OR IGNORE INTO plot_activities (plot_id, activity_id) SELECT ?, id FROM activities WHERE id = ?');
  for (const actId of activityIds) insert.run(plotId, actId);
}

app.get('/api/plots', (req, res) => {
  try {
    const plots = db.prepare('SELECT id AS _id, title, description, canvasData FROM plots ORDER BY id DESC').all();
    res.json(plots.map(plot => ({
      ...plot,
      activities: selectPlotActivities.all(plot._id).map(act => ({
        ...act,
        items: selectActivityItems.all(act._id)
      }))
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plots', (req, res) => {
  try {
    const title = cleanText(req.body.title);
    if (!title) return res.status(400).json({ error: 'Укажите название сюжета' });

    const id = transaction(() => {
      const info = db.prepare('INSERT INTO plots (title, description, canvasData) VALUES (?, ?, ?)')
        .run(title, cleanText(req.body.description), typeof req.body.canvasData === 'string' ? req.body.canvasData : '');
      setPlotActivities(info.lastInsertRowid, toIdList(req.body.activityIds));
      return info.lastInsertRowid;
    });

    res.status(201).json(getPlot(id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/plots/:id', (req, res) => {
  try {
    const existing = getPlot(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Сюжет не найден' });

    const title = cleanText(req.body.title);
    if (!title) return res.status(400).json({ error: 'Укажите название сюжета' });

    transaction(() => {
      db.prepare('UPDATE plots SET title = ?, description = ?, canvasData = ? WHERE id = ?')
        .run(title, cleanText(req.body.description), typeof req.body.canvasData === 'string' ? req.body.canvasData : existing.canvasData, existing._id);
      setPlotActivities(existing._id, toIdList(req.body.activityIds));
    });

    res.json(getPlot(existing._id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/plots/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM plots WHERE id = ?').run(req.params.id);
    res.json({ message: 'Сюжет удален' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- СЦЕНАРИИ (SCENARIOS) ---
function getScenario(id) {
  return db.prepare('SELECT id AS _id, title, description, targetDuration, plotsData, createdAt FROM scenarios WHERE id = ?').get(id);
}

app.get('/api/scenarios', (req, res) => {
  try {
    const scenarios = db.prepare('SELECT id AS _id, title, description, targetDuration, plotsData, createdAt FROM scenarios ORDER BY id DESC').all();
    res.json(scenarios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scenarios/:id', (req, res) => {
  try {
    const sc = getScenario(req.params.id);
    if (!sc) return res.status(404).json({ error: 'Сценарий не найден' });
    res.json(sc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scenarios', (req, res) => {
  try {
    const title = cleanText(req.body.title);
    if (!title) return res.status(400).json({ error: 'Укажите название сценария' });

    const info = db.prepare(`
      INSERT INTO scenarios (title, description, targetDuration, plotsData)
      VALUES (?, ?, ?, ?)
    `).run(
      title,
      cleanText(req.body.description),
      toPositiveInt(req.body.targetDuration, 60),
      typeof req.body.plotsData === 'string' ? req.body.plotsData : JSON.stringify(req.body.plotsData || [])
    );

    res.status(201).json(getScenario(info.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/scenarios/:id', (req, res) => {
  try {
    const existing = getScenario(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Сценарий не найден' });

    const title = cleanText(req.body.title);
    if (!title) return res.status(400).json({ error: 'Укажите название сценария' });

    const plotsData = req.body.plotsData !== undefined
      ? (typeof req.body.plotsData === 'string' ? req.body.plotsData : JSON.stringify(req.body.plotsData || []))
      : existing.plotsData;

    db.prepare(`
      UPDATE scenarios SET title = ?, description = ?, targetDuration = ?, plotsData = ? WHERE id = ?
    `).run(
      title,
      cleanText(req.body.description),
      toPositiveInt(req.body.targetDuration, 60),
      plotsData,
      existing._id
    );

    res.json(getScenario(existing._id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/scenarios/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
    res.json({ message: 'Сценарий удален' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../code/index.html'));
});

// Ошибки загрузки файлов и прочие непойманные ошибки
app.use((err, req, res, next) => {
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой (максимум 10 МБ)' : err.message;
  res.status(400).json({ error: message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
