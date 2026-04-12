#!/usr/bin/env node

/**
 * BlenderLab Setup Verification Script
 * Run this to verify your environment is properly configured
 */

const admin = require('firebase-admin');

console.log('\n🔍 BlenderLab Setup Verification\n');
console.log('=' .repeat(60));

// Check Node.js version
const nodeVersion = process.version;
console.log(`\n✓ Node.js version: ${nodeVersion}`);
if (parseInt(nodeVersion.slice(1).split('.')[0]) < 20) {
  console.log('  ⚠️  Warning: Node.js 20+ recommended');
}

// Check environment variables
console.log('\n📋 Environment Variables:');

const requiredVars = {
  'FIREBASE_CONFIG or FIREBASE_SERVICE_ACCOUNT_KEY': 
    process.env.FIREBASE_CONFIG || process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  'R2_BUCKET_NAME': process.env.R2_BUCKET_NAME,
  'R2_ACCESS_KEY': process.env.R2_ACCESS_KEY,
  'R2_SECRET_KEY': process.env.R2_SECRET_KEY,
  'CF_ACCOUNT_ID': process.env.CF_ACCOUNT_ID,
  'R2_PUBLIC_URL': process.env.R2_PUBLIC_URL,
};

const optionalVars = {
  'GITHUB_TOKEN': process.env.GITHUB_TOKEN,
  'GITHUB_OWNER': process.env.GITHUB_OWNER,
  'GITHUB_REPO': process.env.GITHUB_REPO,
};

let missingRequired = [];
let missingOptional = [];

for (const [name, value] of Object.entries(requiredVars)) {
  if (value) {
    console.log(`  ✓ ${name}: Set`);
  } else {
    console.log(`  ✗ ${name}: MISSING`);
    missingRequired.push(name);
  }
}

console.log('\n📋 Optional Variables (for GitHub Actions trigger):');
for (const [name, value] of Object.entries(optionalVars)) {
  if (value) {
    console.log(`  ✓ ${name}: Set`);
  } else {
    console.log(`  ⚠️  ${name}: Not set`);
    missingOptional.push(name);
  }
}

// Test Firebase connection
console.log('\n🔥 Firebase Connection:');
try {
  const serviceAccountJson = process.env.FIREBASE_CONFIG || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJson) {
    throw new Error('No Firebase config found');
  }
  
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  
  const db = admin.firestore();
  console.log(`  ✓ Firebase initialized`);
  console.log(`  ✓ Project ID: ${serviceAccount.project_id}`);
  
  // Try to access Firestore
  db.collection('_test').limit(1).get()
    .then(() => {
      console.log(`  ✓ Firestore connection successful`);
      
      // Summary
      console.log('\n' + '='.repeat(60));
      if (missingRequired.length === 0) {
        console.log('\n✅ Setup Complete! All required variables are set.');
        if (missingOptional.length > 0) {
          console.log('\n⚠️  Optional variables missing (GitHub Actions won\'t trigger):');
          missingOptional.forEach(v => console.log(`   - ${v}`));
          console.log('\n   Set these in Vercel to enable automatic workflow triggering.');
        }
      } else {
        console.log('\n❌ Setup Incomplete! Missing required variables:');
        missingRequired.forEach(v => console.log(`   - ${v}`));
        console.log('\n   Add these to your .env.local file or Vercel environment variables.');
      }
      console.log('\n' + '='.repeat(60) + '\n');
      process.exit(missingRequired.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.log(`  ✗ Firestore connection failed: ${err.message}`);
      console.log('\n❌ Firebase connection error. Check your credentials.');
      process.exit(1);
    });
    
} catch (err) {
  console.log(`  ✗ Firebase initialization failed: ${err.message}`);
  console.log('\n❌ Firebase setup error. Check your FIREBASE_CONFIG format.');
  process.exit(1);
}
