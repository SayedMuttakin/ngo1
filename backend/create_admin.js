const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function createAdmin() {
  try {
    console.log('🔗 Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB!');

    const User = require('./models/User');

    const email = 'anarul258011@gmail.com';
    const plainPassword = '112233'; // Pass plain text, Mongoose will hash it automatically in the pre-save hook!

    // Delete any existing user with this email
    await User.deleteMany({ email });

    const adminUser = new User({
      name: 'Anarul Islam',
      email: email,
      password: plainPassword, // Mongoose pre-save hook will hash this once
      role: 'admin',
      isActive: true,
      isApproved: true,
      isSuperAdmin: true,
      collectionType: 'weekly'
    });

    await adminUser.save();
    console.log(`\n🎉 SUCCESS: Created Admin user successfully!`);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${plainPassword}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating Admin:', error);
    process.exit(1);
  }
}

createAdmin();
