const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Мидлвары
app.use(express.json());

// Раздаем статические файлы из соседней папки code/
app.use(express.static(path.join(__dirname, '../code')));

// ==========================================
// 1. СХЕМЫ И МОДЕЛИ MONGOOSE
// ==========================================

// Кластер 1: Предметы (Attributes/Items)
const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  photoUrl: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  description: { type: String, default: '' },
  note: { type: String, default: '' }
});
const Item = mongoose.model('Item', itemSchema);

// Кластер 2: Активности (Activities)
const activitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }]
});
const Activity = mongoose.model('Activity', activitySchema);

// Кластер 3: Сюжеты (Plots)
const plotSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  activities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Activity' }]
});
const Plot = mongoose.model('Plot', plotSchema);


// ==========================================
// 2. REST API РОУТЫ
// ==========================================

// --- ПРЕДМЕТЫ ---
app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: 'Атрибут удален' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// --- АКТИВНОСТИ ---
app.get('/api/activities', async (req, res) => {
  try {
    const activities = await Activity.find().populate('items');
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activities', async (req, res) => {
  try {
    const activity = await Activity.create(req.body);
    res.status(201).json(activity);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// --- СЮЖЕТЫ ---
app.get('/api/plots', async (req, res) => {
  try {
    const plots = await Plot.find().populate({
      path: 'activities',
      populate: { path: 'items' }
    });
    res.json(plots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plots', async (req, res) => {
  try {
    const plot = await Plot.create(req.body);
    res.status(201).json(plot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Отдача главной страницы из папки code/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../code/index.html'));
});


// ==========================================
// 3. ЗАПУСК СЕРВЕРА И БД
// ==========================================
const PORT = 3000;
const DB_URL = 'mongodb://127.0.0.1:27017/kvest_map_db';

mongoose.connect(DB_URL)
  .then(() => {
    console.log('Успешное подключение к MongoDB');
    app.listen(PORT, () => {
      console.log(`Сервер запущен на http://localhost:${PORT}`);
    });
  })
  .catch(err => console.error('Ошибка подключения к MongoDB:', err));