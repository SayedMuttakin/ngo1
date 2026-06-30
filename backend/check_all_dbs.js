const mongoose = require('mongoose');
require('dotenv').config();

const URIS = [
  { name: 'Atlas DB', uri: process.env.MONGODB_URI },
  { name: 'Local ngo_management', uri: 'mongodb://localhost:27017/ngo_management' },
  { name: 'Local ngo_management_local', uri: 'mongodb://localhost:27017/ngo_management_local' }
];

async function checkAll() {
  for (const item of URIS) {
    if (!item.uri) continue;
    try {
      console.log(`\n🔗 Connecting to ${item.name}...`);
      const conn = await mongoose.createConnection(item.uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 3000
      }).asPromise();
      
      const db = conn.db;
      // Get all collection names
      const collections = await db.listCollections().toArray();
      console.log(`✅ Connected! Collections in ${item.name}:`);
      
      for (const col of collections) {
        const count = await db.collection(col.name).countDocuments({});
        console.log(`   - ${col.name}: ${count} documents`);
      }
      
      await conn.close();
    } catch (err) {
      console.log(`❌ Failed to connect to ${item.name}: ${err.message}`);
    }
  }
  process.exit(0);
}

checkAll();
