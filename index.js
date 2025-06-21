// backend/index.js
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const http     = require('http');
const { Server } = require('socket.io');

// Models
const User    = require('./models/User');
const Message = require('./models/Message');

// App setup
const app        = express();
const PORT       = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret';
const MONGO_URI  = process.env.MONGO_URI || 'mongodb://localhost:27017/messenger';

// Parse FRONTEND_ORIGIN as comma-separated list
const rawOrigins = process.env.FRONTEND_ORIGIN || 'http://localhost:3000,https://your-netlify-site';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim());

// CORS configuration
const corsOptions = {
  origin: (incomingOrigin, callback) => {
    if (!incomingOrigin || allowedOrigins.includes(incomingOrigin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
};

app.use(express.json());
app.use(cors(corsOptions));

// MongoDB connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Auth middleware for REST
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or malformed token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload;
    next();
  } catch (err) {
    console.error('❌ Token error:', err);
    res.status(403).json({ message: 'Invalid or expired token' });
  }
}

// REST routes
app.get('/', (req, res) => res.send('🚀 Backend server is running'));

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const newUser = new User({ email, password });
    await newUser.save();
    res.json({ message: 'Signup successful', userId: newUser._id });
  } catch (err) {
    console.error('❌ Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, email }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/messages/send', authenticate, async (req, res) => {
  const { receiver, text } = req.body;
  const sender = req.user.email;
  try {
    const msg = new Message({ sender, receiver, text });
    await msg.save();
    res.json({ message: 'Message sent', timestamp: msg.timestamp });
  } catch (err) {
    console.error('❌ Send error:', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

app.get('/messages/history', authenticate, async (req, res) => {
  const user1 = req.user.email;
  const user2 = req.query.user2;
  try {
    const msgs = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
  } catch (err) {
    console.error('❌ History error:', err);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// HTTP + WebSocket server
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

// Socket authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth error: token required'));
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    socket.user = payload;
    next();
  } catch (err) {
    console.error('❌ Socket auth error:', err);
    next(new Error('Auth error: invalid token'));
  }
});

io.on('connection', socket => {
  console.log('🔌 Client connected:', socket.id, socket.user.email);
  socket.join(socket.user.email);

  socket.on('send_message', async ({ receiver, text }) => {
    const sender = socket.user.email;
    try {
      const msg = new Message({ sender, receiver, text });
      await msg.save();
      io.to(receiver).emit('receive_message', { sender, receiver, text, timestamp: msg.timestamp });
    } catch (err) {
      console.error('❌ Socket send error:', err);
    }
  });

  socket.on('disconnect', reason => {
    console.log('❌ Client disconnected:', socket.id, reason);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
