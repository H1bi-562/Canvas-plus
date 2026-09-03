const jwt = require('jsonwebtoken');
const pool = require('../db');

// Attach verified user to req.user on every protected route
// Checks table so logged out or revoked JWT tokens are rejected even if unexpired
async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  //tokens before this feature existed will not carry a jti
  //treat as untrackable
  if (!decoded.jti) {
    return res.status(401).json({ error: 'Token does not have tracking id, please log in again' });
  }

  try {
    const result = await pool.query(
      'SELECT revoked FROM "Token" WHERE jti = $1',
      [decoded.jti]
    );
    
    //Expiry checked out, no record of issuing it
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unknown token' });
    }

    if (result.rows[0].revoked) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // {id, email, jti} now available to downstream route handlers
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth lookup error:', err.message);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

module.exports = authMiddleware;