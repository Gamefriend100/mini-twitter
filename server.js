require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const { Server } = require('socket.io');

const User = require('./models/User');
const Post = require('./models/Post');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI no definida en .env');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => {
    console.error('❌ Error de conexión MongoDB:', err);
    process.exit(1);
  });

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup using connect-mongo
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
});

app.use(sessionMiddleware);

// Serve static
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success:false, message: 'Falta usuario o contraseña' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ success:false, message: 'Usuario ya existe' });
    const user = new User({ username, password });
    await user.save();
    req.session.user = user.username;
    res.json({ success:true, user: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message: 'Error en registro' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success:false, message: 'Falta usuario o contraseña' });
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ success:false, message: 'Usuario no encontrado' });
    const match = await user.comparePassword(password);
    if (!match) return res.status(400).json({ success:false, message: 'Contraseña incorrecta' });
    req.session.user = user.username;
    res.json({ success:true, user: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message: 'Error en login' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success:false });
    res.clearCookie('connect.sid');
    res.json({ success:true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ authenticated:true, user: req.session.user });
  return res.json({ authenticated:false });
});

// --- POSTS API ---
app.get('/api/posts', async (req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 });
  res.json(posts);
});

app.post('/api/posts', async (req, res) => {
  try {
    if (!req.session || !req.session.user) return res.status(401).json({ message: 'No autenticado' });
    const user = req.session.user;
    const { content } = req.body;
    const hashtags = (content.match(/#\w+/g) || []).map(h => h.toLowerCase());
    const post = new Post({ user, content, hashtags });
    const saved = await post.save();
    io.emit('new_post', saved);
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creando post' });
  }
});

app.post('/api/posts/:id/reply', async (req, res) => {
  try {
    if (!req.session || !req.session.user) return res.status(401).json({ message: 'No autenticado' });
    const { id } = req.params;
    const { content } = req.body;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post no encontrado' });
    const reply = { user: req.session.user, content };
    post.replies.push(reply);
    await post.save();
    io.emit('new_reply', { postId: id, reply });
    res.json(reply);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en reply' });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    if (!req.session || !req.session.user) return res.status(401).json({ message: 'No autenticado' });
    const { id } = req.params;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post no encontrado' });
    post.likes = (post.likes || 0) + 1;
    await post.save();
    io.emit('update_likes', { id, likes: post.likes });
    res.json({ likes: post.likes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en like' });
  }
});

// Start server and attach socket.io
io.on('connection', (socket) => {
  console.log('🟢 Usuario conectado (socket)');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server en http://localhost:${PORT}`));
