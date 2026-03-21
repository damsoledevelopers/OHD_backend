/**
 * Admin Seed Script
 * 
 * Creates the default super_admin user for the OHD platform.
 * If a super_admin already exists, it will skip creation.
 * 
 * Run with: node scripts/seedAdmin.js
 * Or use:   npm run seed:admin
 * 
 * Default credentials:
 *   Email:    admin@ohd.com
 *   Password: Admin@123
 * 
 * ⚠️  Change these credentials immediately after first login in production!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ohd';

// ──────────────────────────────────────────────
// Default admin credentials (change in production)
// ──────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ohd.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const SALT_ROUNDS = 10;

async function seedAdmin() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if a super_admin already exists
    const existingAdmin = await User.findOne({ role: 'super_admin' });

    if (existingAdmin) {
      console.log(`\n⚠️  Super admin already exists:`);
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      console.log(`\n   Skipping seed. Delete the existing admin first if you want to re-seed.`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Hash the password
    console.log('\n🔐 Hashing admin password...');
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

    // Create the super_admin user
    const admin = await User.create({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'super_admin',
    });

    console.log('\n✅ Super admin created successfully!');
    console.log('─'.repeat(40));
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Role:     ${admin.role}`);
    console.log(`   ID:       ${admin._id}`);
    console.log('─'.repeat(40));
    console.log('\n⚠️  IMPORTANT: Change the default password after first login!');

    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding admin:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedAdmin();
}

module.exports = seedAdmin;
