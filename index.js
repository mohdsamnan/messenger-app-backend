// backend/index.js
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const http     = require('http');
const { Server } = require('socket.io');

const User    = require('./models/User');
const Message = require('./models/Message');

const app        = express();
const PORT       = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret';
const MONGO_URI  = process.env.MONGO_URI ||
                   'mongodb://localhost:27017/messenger';

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000'
}));

// MongoDB Connection
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// —————————————————————————————————————————————
// REST Routes
// —————————————————————————————————————————————

app.get('/', (req, res) => res.send('Backend server is running 🚀'));

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'User already exists' });
    }
    await new User({ email, password }).save();
    res.json({ message: 'Signup successful' });
  } catch (err) {
    console.error("❌ Signup error:", err);
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
    console.error("❌ Login error:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Messages REST fallback
app.post('/messages/send', async (req, res) => {
  const { sender, receiver, text } = req.body;
  try {
    await new Message({ sender, receiver, text }).save();
    res.json({ message: 'Message sent successfully' });
  } catch (err) {
    console.error("❌ Failed to send message:", err);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

app.get('/messages/history', async (req, res) => {
  const { user1, user2 } = req.query;
  try {
    const msgs = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
  } catch (err) {
    console.error("❌ Failed to fetch messages:", err);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// —————————————————————————————————————————————
// Socket.IO Setup
// —————————————————————————————————————————————

const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }
});

io.on('connection', socket => {
  console.log('🔌 Client connected:', socket.id);

  // Clients should join their own room on connect:
  socket.on('register', userId => {
    socket.join(userId);
  });

  socket.on('send_message', async data => {
    const { sender, receiver, text } = data;
    try {
      const msg = new Message({ sender, receiver, text });
      await msg.save();
      io.to(receiver).emit('receive_message', {
        sender, receiver, text, timestamp: msg.timestamp
      });
    } catch (err) {
      console.error("❌ Socket send_message error:", err);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
