require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  console.log('Attempting to connect to:', uri.replace(/:([^@/]+)@/, ':****@')); // Hide password in logs
  
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connection Successful!');
    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Connection Failed!');
    console.error('Error Details:', err.message);
  }
}

testConnection();
