# BlenderLab 🎨

**Generate 3D Assets from Blender Python Scripts**

A cloud-native platform for procedural 3D asset generation. Write Blender Python scripts, submit them to the cloud, and get your 3D models exported in multiple formats (GLB, FBX, STL, USD) via Cloudflare R2.

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 20+
- npm or yarn
- Firebase Firestore project
- Cloudflare R2 bucket
- GitHub repository with Actions enabled

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create `.env.local` for local development:

```env
# Firebase (public - safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin (server-side - DO NOT expose)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...full json...}'

# GitHub (for triggering workflows)
GITHUB_TOKEN=github_pat_xxx
GITHUB_OWNER=your_username
GITHUB_REPO=blenderlab
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## 📋 Deployment

### Vercel Setup

1. Connect repository to Vercel
2. Set environment variables in Vercel dashboard (see `.env.local` example above)
3. Deploy

### GitHub Actions Setup

1. Create R2 bucket and get credentials
2. Add secrets to GitHub repository:
   ```
   FIREBASE_CONFIG              # Full Firebase service account JSON
   R2_BUCKET_NAME
   R2_ACCESS_KEY
   R2_SECRET_KEY
   CF_ACCOUNT_ID
   R2_PUBLIC_URL               # e.g., https://assets.example.com
   GITHUB_TOKEN               # For workflow dispatch
   ```

3. GitHub Actions workflow runs automatically when triggered via `/api/submit-job` endpoint

---

## 📚 How It Works

1. **User submits script** → ScriptSubmitForm captures Blender Python code
2. **API creates job** → `/api/submit-job` stores job in Firestore with `status='queued'`
3. **GitHub Actions triggers** → Workflow polls Firestore for queued jobs
4. **Blender runs** → persistent_worker.js executes script with Blender 5.0+
5. **Export & upload** → Worker exports in multiple formats, uploads to R2
6. **User downloads** → Job status page shows download links with 24-hour expiry

---

## 📖 Documentation

- [**SCRIPT_WRITING_GUIDE.md**](./SCRIPT_WRITING_GUIDE.md) - How to write Blender scripts
- [**SYSTEM_AUDIT.md**](./SYSTEM_AUDIT.md) - Complete system architecture & verification
- [**ERROR_REFERENCE.md**](./ERROR_REFERENCE.md) - Common errors and solutions
- [**EXPORT_GUIDE.md**](./EXPORT_GUIDE.md) - Format-specific export options

---

## 🎯 Supported Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| **GLB** | `.glb` | Web-ready 3D (recommended) |
| **FBX** | `.fbx` | Game engines (Unity, Unreal) |
| **STL** | `.stl` | 3D printing |
| **USD** | `.usd` | Professional workflows |
| ~~OBJ~~ | `.obj` | Disabled (Blender 5.0 limitation) |

---

## 🔗 API Reference

### POST `/api/submit-job`

Submit a Blender script for processing.

**Request:**
```json
{
  "script": "import bpy\nbpy.ops.mesh.primitive_cube_add(size=2)",
  "formats": ["glb", "fbx"]
}
```

**Response:**
```json
{
  "jobId": "abc123xyz"}
```

Then navigate to `/job/abc123xyz` to monitor progress and download files.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 14 (TypeScript, Tailwind CSS)
- **Backend:** Firebase Firestore + Next.js API Routes
- **Worker:** Node.js + Blender 5.0+ (headless)
- **Storage:** Cloudflare R2 (S3-compatible)
- **CI/CD:** GitHub Actions
- **Hosting:** Vercel

---

## 📊 System Architecture

See [SYSTEM_AUDIT.md](./SYSTEM_AUDIT.md) for detailed architecture, environment variable reference, and security considerations.

---

## ⚡ Performance

- **Export time:** 30 seconds to few minutes (depends on complexity)
- **Upload time:** <1 second (R2 is fast)
- **Job queue:** Processed sequentially (one per GitHub Actions run)
- **File expiry:** 24 hours (configurable in code)

---

## 🐛 Troubleshooting

### Script doesn't export anything
→ Check [SCRIPT_WRITING_GUIDE.md](./SCRIPT_WRITING_GUIDE.md) - you must select objects at the end

### "No exportable objects in scene"
→ Your script didn't create any mesh objects

### GitHub Actions doesn't trigger
→ Check `GITHUB_TOKEN` has `repo` + `actions:read` permissions

### Files aren't publicly accessible
→ Verify R2 bucket has public access and `R2_PUBLIC_URL` is set correctly

See [ERROR_REFERENCE.md](./ERROR_REFERENCE.md) for more solutions.

---

## 📄 License

MIT
