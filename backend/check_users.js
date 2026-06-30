const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ngo_management';

async function checkUsers() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB!');

    const User = require('./models/User');
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users in database:`);
    users.forEach(u => {
      console.log(`- ID: ${u._id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role}`);
    });
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking users:', error);
    process.exit(1);
  }
}

checkUsers();
