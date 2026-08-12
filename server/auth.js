const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { findClientByLogin } = require('./lib/stats');

const JWT_SECRET = process.env.JWT_SECRET || 'beyond-reality-dev-secret-2026';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = String(stored).split(':');
  const test = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, client_id: user.client_id, name: user.name, location: user.location || null },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user || !req.user.id) throw new Error('bad token');
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function rolesAllowed(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorised for this action' });
    }
    next();
  };
}

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count === 0) {
    db.prepare('INSERT INTO users (name, username, password_hash, role, client_id) VALUES (?,?,?,?,?)')
      .run('Finance Officer', 'finance', hashPassword('finance123'), 'finance', null);
    console.log('[seed] finance user: finance / finance123');
  }
}

module.exports = { hashPassword, verifyPassword, signToken, authRequired, rolesAllowed, seedUsers, JWT_SECRET, findClientByLogin };
