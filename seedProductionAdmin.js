require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'admin@ohd.com';
const ADMIN_PASSWORD = 'Admin@123';

async function seedProductionAdmin() {
  try {
    console.log('🔌 Connecting to production database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to production MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('⚠️ Admin already exists in production');
      await mongoose.connection.close();
      return;
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = await User.create({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'super_admin',
    });

    console.log('✅ Production admin created successfully!');
    console.log(`Email: ${admin.email}`);
    console.log('Password: Admin@123');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedProductionAdmin();
