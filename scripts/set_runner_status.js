const admin = require('firebase-admin');

const status = process.argv[2]; // 'active' or 'inactive'

if (!status) {
  console.error('Usage: node set_runner_status.js <active|inactive>');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  await db.collection('system').doc('runner').set({
    status,
    updatedAt: Date.now(),
  });
  console.log(`Runner status set to: ${status}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error setting runner status:', err);
  process.exit(1);
});
