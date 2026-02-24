const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_CONFIG)
  )
});

const db = admin.firestore();
const status = process.argv[2]; // 'active' or 'inactive'

const CRON_HOURS_UTC = [0, 6, 12, 18];

function getNextRunTime() {
  const now = new Date();
  for (const hour of CRON_HOURS_UTC) {
    const next = new Date();
    next.setUTCHours(hour, 0, 0, 0);
    next.setUTCSeconds(0, 0);
    if (next.getTime() > now.getTime()) return next.getTime();
  }
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

function getWindowEndTime() {
  const now = new Date();
  const currentHourUTC = now.getUTCHours();
  const lastCronHour = [...CRON_HOURS_UTC]
    .reverse()
    .find(h => h <= currentHourUTC) ?? 18;
  const windowStart = new Date();
  windowStart.setUTCHours(lastCronHour, 0, 0, 0);
  return windowStart.getTime() + (355 * 60 * 1000);
}

async function main() {
  await db.collection('system').doc('runner').set({
    status,
    lastUpdated: Date.now(),
    nextRunAt:    status === 'inactive' ? getNextRunTime()   : null,
    windowEndsAt: status === 'active'   ? getWindowEndTime() : null,
    currentJobId: null,
  });

  console.log(`✅ Runner marked as: ${status}`);
  process.exit(0);
}

main();
