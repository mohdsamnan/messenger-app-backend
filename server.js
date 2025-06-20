const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;
const SECRET_KEY = 'super-secret-key'; // For now, stored directly

app.use(cors());
app.use(bodyParser.json());

// In-memory user store (for small group only)
const users = {};

// Route: Sign up
app.post('/signup', (req, res) => {
  const { email, password } = req.body;
  if (users[email]) {
    return res.status(409).json({ message: 'User already exists' });
  }
  users[email] = { password };
  res.status(201).json({ message: 'User created' });
});

// Route: Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users[email];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: '1h' });
  res.json({ token });
});

// Route: Get current user info
app.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);
  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.sendStatus(403);
    res.json({ email: decoded.email });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
