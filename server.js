// server.js
require('dotenv').config();            // only if you want to pull vars from a .env locally
const express    = require('express');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const bodyParser = require('body-parser');

const app        = express();
const PORT       = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key';
const FRONTEND   = process.env.FRONTEND_URL   // e.g. https://your-site.netlify.app

// only allow your frontend origin (replace FRONTEND_URL in Netlify env)
app.use(cors({
  origin: FRONTEND,
  credentials: true,
}));

app.use(bodyParser.json());

// In-memory user store
const users = {};

// Sign-up
app.post('/signup', (req, res) => {
  const { email, password } = req.body;
  if (users[email]) return res.status(409).json({ message: 'User already exists' });
  users[email] = { password };
  res.status(201).json({ message: 'User created' });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users[email];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: '1h' });
  res.json({ token });
});

// Get current user
app.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.sendStatus(403);
    res.json({ email: decoded.email });
  });
});

// Start server on all interfaces
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
