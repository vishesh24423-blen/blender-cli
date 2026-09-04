/* eslint-disable @typescript-eslint/no-require-imports */
const admin = require('firebase-admin');

// Usage: node set_runner_status.js <active|inactive|ready|starting> [note]
// Called from the workflow's `if: always()` cleanup step so a crashed/failed
// run never leaves a frozen 'ready' status in Firestore.
const status = process.argv[2];
const note = process.argv[3] || null;

if (!status || !['active', 'inactive', 'ready', 'starting'].includes(status)) {
  console.error('Usage: node set_runner_status.js <active|inactive|ready|starting> [note]');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  // merge:true — never wipe windowEndsAt/startedAt/currentJobId etc.
  // lastActive: Date.now() on purpose — marks *when we last knew* the state.
  await db.collection('system').doc('runner').set({
    status,
    lastActive: Date.now(),
    ...(note ? { note } : {}),
    ...(status === 'inactive' ? { currentJobId: null } : {}),
  }, { merge: true });
  console.log(`Runner status set to: ${status}${note ? ` (${note})` : ''}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
