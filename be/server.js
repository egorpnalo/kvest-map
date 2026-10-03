const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

// ==========================================
// 1. ИНИЦИАЛИЗА БД SQLITE
// ==========================================
const db = new Database(path.join(__dirname, 'database.sqlite'));
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
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
`);

// Миграции колонок при перезапуске
try { db.exec(`ALTER TABLE activities ADD COLUMN description TEXT DEFAULT ''`); } catch (e) {}
try { db.exec(`ALTER TABLE plots ADD COLUMN canvasData TEXT DEFAULT ''`); } catch (e) {}

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
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, '../code')));
app.use('/sourse/pic', express.static(uploadDir));

// ==========================================
// 3. REST API РОУТЫ
// ==========================================

// --- ПРЕДМЕТЫ (ITEMS) ---
app.get('/api/items', (req, res) => {
  try {
    const items = db.prepare('SELECT id AS _id, name, photoUrl, quantity, description, note FROM items').all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', upload.single('photo'), (req, res) => {
  try {
    const { name, quantity, description, note } = req.body;
    const photoUrl = req.file ? `/sourse/pic/${req.file.filename}` : '';

    const stmt = db.prepare(`
      INSERT INTO items (name, photoUrl, quantity, description, note)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, photoUrl, Number(quantity) || 1, description || '', note || '');

    const newItem = db.prepare('SELECT id AS _id, name, photoUrl, quantity, description, note FROM items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(newItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    if (item) {
      db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
      if (item.photoUrl) {
        const filePath = path.join(__dirname, '..', item.photoUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    res.json({ message: 'Атрибут успешно удален' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- АКТИВНОСТИ (ACTIVITIES) ---
app.get('/api/activities', (req, res) => {
  try {
    const activities = db.prepare('SELECT id AS _id, title, durationMinutes, description FROM activities').all();
    const result = activities.map(act => {
      const items = db.prepare(`
        SELECT i.id AS _id, i.name, i.photoUrl, i.quantity
        FROM items i
        JOIN activity_items ai ON i.id = ai.item_id
        WHERE ai.activity_id = ?
      `).all(act._id);
      return { ...act, items };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activities', (req, res) => {
  try {
    const { title, durationMinutes, description, items } = req.body;
    const stmt = db.prepare('INSERT INTO activities (title, durationMinutes, description) VALUES (?, ?, ?)');
    const info = stmt.run(title, Number(durationMinutes) || 0, description || '');

    if (Array.isArray(items)) {
      const insertRelation = db.prepare('INSERT INTO activity_items (activity_id, item_id) VALUES (?, ?)');
      for (const itemId of items) {
        insertRelation.run(info.lastInsertRowid, itemId);
      }
    }

    res.status(201).json({ _id: info.lastInsertRowid, title, durationMinutes, description });
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
app.get('/api/plots', (req, res) => {
  try {
    const plots = db.prepare('SELECT id AS _id, title, description, canvasData FROM plots').all();
    const result = plots.map(plot => {
      const activities = db.prepare(`
        SELECT a.id AS _id, a.title, a.durationMinutes, a.description
        FROM activities a
        JOIN plot_activities pa ON a.id = pa.activity_id
        WHERE pa.plot_id = ?
      `).all(plot._id);
      return { ...plot, activities };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plots', (req, res) => {
  try {
    const { title, description, canvasData, activityIds } = req.body;
    const stmt = db.prepare('INSERT INTO plots (title, description, canvasData) VALUES (?, ?, ?)');
    const info = stmt.run(title || 'Без названия', description || '', canvasData || '');
    const plotId = info.lastInsertRowid;

    if (Array.isArray(activityIds)) {
      const insertRelation = db.prepare('INSERT INTO plot_activities (plot_id, activity_id) VALUES (?, ?)');
      for (const actId of activityIds) {
        insertRelation.run(plotId, actId);
      }
    }

    res.status(201).json({ _id: plotId, title, description, canvasData });
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../code/index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});