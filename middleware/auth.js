const { verifyToken } = require('../utils/jwt');

function getAuthToken(req) {
  // Check cookie first (for frontend)
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  // Fallback to header (for API clients)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function authenticateRequest(req, res, next) {
  try {
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  try {
    authenticateRequest(req, res, () => {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    });
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Authentication failed' });
  }
}

module.exports = {
  authenticateRequest,
  requireAdmin,
  getAuthToken
};

