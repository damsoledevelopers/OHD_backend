require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const users = await User.find({});
    users.forEach(u => {
      console.log(`ID: ${u._id} | Email: ${u.email} | Role: ${u.role}`);
    });
    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkUsers();
