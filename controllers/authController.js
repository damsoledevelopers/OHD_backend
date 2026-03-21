const User = require('../models/User');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const connectDB = require('../config/database');

/** Cross-origin SPA (e.g. Vercel → Render) needs SameSite=None; Lax cookies are often dropped on XHR. */
function authCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 60 * 60 * 24 * 7 * 1000,
    path: '/',
  };
}

async function signup(req, res) {
  try {
    await connectDB();

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if super admin already exists
    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Super admin already exists. Only one super admin is allowed.' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      role: 'super_admin',
    });

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.cookie('token', token, authCookieOptions());

    return res.status(201).json({
      message: 'Super admin created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Signup failed' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);
    console.log('Environment variables check:', {
      MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'MISSING',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
      NODE_ENV: process.env.NODE_ENV || 'development'
    });
    
    await connectDB();

    if (!email || !password) {
      console.log('Login failed: Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Login failed: User not found ->', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User found, checking password...');
    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      console.log('Login failed: Invalid password for ->', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Password valid, generating token...');
    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    console.log('Token generated successfully');
    res.cookie('token', token, authCookieOptions());

    console.log('Login successful for:', email);
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('SERVER LOGIN ERROR:', error.message);
    console.error('Full error:', error);
    return res.status(500).json({ 
      error: error.message || 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function logout(req, res) {
  try {
    res.cookie('token', '', { ...authCookieOptions(), maxAge: 0 });

    return res.json({ message: 'Logout successful' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Logout failed' });
  }
}

module.exports = {
  signup,
  login,
  logout
};

