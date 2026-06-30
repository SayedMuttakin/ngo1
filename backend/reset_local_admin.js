const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ngo_management';

async function resetAdminPassword() {
  try {
    console.log('🔗 Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB!');

    // Get the User model
    const User = require('./models/User');

    const email = 'anarul258011@gmail.com';
    const newPassword = '112233';

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.error(`❌ User with email ${email} not found in database!`);
      process.exit(1);
    }

    console.log(`👤 Found user: ${user.name} (${user.role})`);

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Save directly to database
    user.password = hashedPassword;
    await user.save();

    console.log(`\n🎉 SUCCESS: Password for ${email} has been reset to "${newPassword}"!`);
    console.log('🔑 You can now log in locally using these credentials.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting password:', error);
    process.exit(1);
  }
}

resetAdminPassword();
