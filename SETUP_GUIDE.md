# BlenderLab Complete Setup Guide

This guide will walk you through setting up BlenderLab from scratch.

## Prerequisites

- Node.js 20+ installed
- GitHub account
- Firebase account (free tier works)
- Cloudflare account with R2 enabled
- Vercel account (optional, for deployment)

---

## Step 1: Clone and Install

```bash
git clone <your-repo-url>
cd blenderlab
npm install
```

---

## Step 2: Firebase Setup

### 2.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "blenderlab")
4. Disable Google Analytics (optional)
5. Click "Create project"

### 2.2 Enable Firestore

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in production mode"
4. Select a location close to your users
5. Click "Enable"

### 2.3 Get Firebase Config (Client-side)

1. Go to Project Settings (gear icon)
2. Scroll to "Your apps"
3. Click "Web" icon (</>) to add a web app
4. Register app with a nickname
5. Copy the config values:

```javascript
// You'll see something like this:
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 2.4 Get Service Account Key (Server-side)

1. Go to Project Settings → Service Accounts
2. Click "Generate new private key"
3. Click "Generate key" - downloads a JSON file
4. **Keep this file secure!** It has admin access to your Firebase

---

## Step 3: Cloudflare R2 Setup

### 3.1 Create R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to R2 → Create bucket
3. Enter bucket name (e.g., "blenderlab-assets")
4. Choose location
5. Click "Create bucket"

### 3.2 Configure Public Access

1. Go to your bucket → Settings
2. Under "Public access", click "Allow Access"
3. Copy the public URL (e.g., `https://pub-abc123.r2.dev`)

### 3.3 Get API Credentials

1. Go to R2 → Manage R2 API Tokens
2. Click "Create API token"
3. Give it a name (e.g., "BlenderLab Worker")
4. Permissions: "Object Read & Write"
5. Click "Create API token"
6. **Copy these values** (you won't see them again):
   - Access Key ID
   - Secret Access Key
   - Account ID (shown at top of page)

---

## Step 4: GitHub Setup

### 4.1 Create GitHub Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "BlenderLab Actions")
4. Select scopes:
   - ✓ `repo` (Full control of private repositories)
   - ✓ `workflow` (Update GitHub Action workflows)
5. Click "Generate token"
6. **Copy the token** (starts with `ghp_`)

### 4.2 Add Repository Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret" for each:

```
FIREBASE_CONFIG = <paste entire service account JSON>
R2_BUCKET_NAME = blenderlab-assets
R2_ACCESS_KEY = <your R2 access key>
R2_SECRET_KEY = <your R2 secret key>
CF_ACCOUNT_ID = <your Cloudflare account ID>
R2_PUBLIC_URL = https://pub-abc123.r2.dev
```

---

## Step 5: Local Environment Setup

Create `.env.local` in project root:

```env
# Firebase Client (public - safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Firebase Admin (server-side - DO NOT expose)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# GitHub (for triggering workflows)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-username
GITHUB_REPO=blenderlab
```

**Important:** 
- For `FIREBASE_SERVICE_ACCOUNT_KEY`, paste the **entire JSON** from the downloaded file
- Wrap it in single quotes
- Keep it on one line (or escape newlines)

---

## Step 6: Verify Setup

Run the verification script:

```bash
npm run verify
```

This will check:
- ✓ Node.js version
- ✓ Environment variables
- ✓ Firebase connection
- ✓ Firestore access

If everything is green, you're ready!

---

## Step 7: Test Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Try submitting a simple script:

```python
import bpy
bpy.ops.mesh.primitive_cube_add(size=2)
bpy.ops.object.shade_smooth()
```

**Note:** GitHub Actions won't run locally. To test the full workflow, deploy to Vercel (next step).

---

## Step 8: Deploy to Vercel (Optional)

### 8.1 Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Click "Deploy"

### 8.2 Add Environment Variables

1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.local`:

**Client-side (all environments):**
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

**Server-side (all environments):**
```
FIREBASE_SERVICE_ACCOUNT_KEY
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
```

3. Click "Save"
4. Redeploy the project

---

## Step 9: Test End-to-End

1. Go to your deployed Vercel URL
2. Submit a test script
3. Watch the job status page
4. GitHub Actions should trigger automatically
5. After ~2-3 minutes, download links should appear

---

## Troubleshooting

### "Firebase initialization failed"
- Check `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON
- Verify it's wrapped in single quotes
- Make sure no newlines are breaking the JSON

### "GitHub Actions not triggering"
- Verify `GITHUB_TOKEN` has correct permissions
- Check `GITHUB_OWNER` and `GITHUB_REPO` match your repository
- Ensure workflow file exists at `.github/workflows/main.yml`

### "R2 upload failed"
- Verify R2 credentials are correct
- Check bucket name matches
- Ensure bucket has public access enabled

### "Job stuck in queued"
- Check GitHub Actions tab in your repository
- Look for workflow runs
- Check workflow logs for errors

### Still having issues?
Run the verification script:
```bash
npm run verify
```

Check the logs for specific error messages.

---

## Architecture Overview

```
User submits script
    ↓
Next.js API creates Firestore job
    ↓
API triggers GitHub Actions workflow
    ↓
GitHub runner installs Blender
    ↓
Worker script polls Firestore for jobs
    ↓
Blender executes Python script
    ↓
Exports to GLB/FBX/STL/USD
    ↓
Uploads to Cloudflare R2
    ↓
Updates Firestore with download URLs
    ↓
User downloads files
```

---

## Security Notes

1. **Never commit `.env.local`** - it's in `.gitignore`
2. **Keep service account key secure** - it has admin access
3. **Rotate tokens periodically** - especially GitHub token
4. **Use environment variables** - never hardcode secrets
5. **Enable R2 bucket expiry** - files auto-delete after 24h

---

## Cost Estimates

**Free Tier:**
- Firebase Firestore: 50K reads/day, 20K writes/day
- Cloudflare R2: 10GB storage, 10M requests/month
- GitHub Actions: 2,000 minutes/month
- Vercel: 100GB bandwidth/month

**Typical usage:**
- 1 job = ~2-3 minutes GitHub Actions
- 1 job = ~5-10 Firestore operations
- 1 job = ~1-10MB R2 storage (24h)

**Estimated capacity (free tier):**
- ~600 jobs/month (GitHub Actions limit)
- ~5,000 jobs/month (Firestore limit)
- ~1,000 jobs/month (R2 storage limit)

**Bottleneck:** GitHub Actions minutes (2,000/month)

---

## Next Steps

1. ✓ Setup complete
2. ✓ Test with example scripts
3. Read [SCRIPT_WRITING_GUIDE.md](./SCRIPT_WRITING_GUIDE.md)
4. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if issues arise
5. Explore [SAMPLES.py](./scripts/SAMPLES.py) for inspiration

Happy creating! 🎨
