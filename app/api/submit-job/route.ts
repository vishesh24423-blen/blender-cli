import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Firebase Admin is initialized lazily inside the POST handler
let db: FirebaseFirestore.Firestore | null = null;

function initializeFirebase() {
    if (db) return db; // Already initialized
    
    const serviceAccountJson = process.env.FIREBASE_CONFIG || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountJson) {
        throw new Error('Missing Firebase config: set FIREBASE_CONFIG or FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        }
        db = admin.firestore();
        return db;
    } catch (parseError) {
        throw new Error(`Failed to parse Firebase config: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
}

export async function POST(request: NextRequest) {
    try {
        // Initialize Firebase on demand
        const database = initializeFirebase();
        
        const body = await request.json();
        const { script, formats, quality = 'standard' } = body;

        if (!script || typeof script !== 'string') {
            return NextResponse.json({ error: 'Script is required' }, { status: 400 });
        }

        if (!formats || !Array.isArray(formats) || formats.length === 0) {
            return NextResponse.json({ error: 'At least one format must be selected' }, { status: 400 });
        }

        const validFormats = ['glb', 'fbx', 'stl', 'usd'];
        const invalidFormats = formats.filter((f: string) => !validFormats.includes(f));
        if (invalidFormats.length > 0) {
            return NextResponse.json({ error: `Invalid formats: ${invalidFormats.join(', ')}` }, { status: 400 });
        }

        const validQualities = ['draft', 'standard', 'cinematic'];
        const qualityPreset = validQualities.includes(quality) ? quality : 'standard';

        // Create job in Firestore
        const jobRef = await database.collection('jobs').add({
            script,
            userId: 'anonymous',
            status: 'queued',
            formats,
            quality: qualityPreset,
            outputs: {},
            createdAt: Date.now(),
            error: null,
        });

        const jobId = jobRef.id;
        console.log(`📝 Job created: ${jobId} (${formats.join(", ")})`);

        // 2. Check and activate runner
        let runnerStatus = 'unknown';
        let workflowTriggered = false;
        
        try {
            const runnerDocRef = database.collection('system').doc('runner');

            await database.runTransaction(async (transaction) => {
                const runnerDoc = await transaction.get(runnerDocRef);
                const runnerData = runnerDoc.data();

                const currentStatus = runnerData?.status ?? 'inactive';
                const lastActive = runnerData?.lastActive ?? 0;
                const now = Date.now();

                // Trigger workflow if runner is NOT actively processing.
                // First-ever job (no runner doc) → 'inactive' → wake. Stale
                // 'starting' (dispatch died) also re-wakes via isStale.
                // Threshold is 2min: the worker heartbeats every 30s, so a
                // quieter runner is a dead Actions run (its status would
                // otherwise sit frozen at 'ready' and swallow new jobs).
                const isStale = now - lastActive > 2 * 60 * 1000;
                const needsWake = currentStatus === 'inactive' || currentStatus === 'unknown' || isStale;

                if (needsWake) {
                    workflowTriggered = true;
                    runnerStatus = 'starting';
                    console.log(`🔴 Waking runner: status=${currentStatus}, stale=${isStale}`);
                    
                    transaction.set(runnerDocRef, {
                        status: 'starting',
                        startedAt: now,
                        lastActive: now,
                        triggeredJobId: jobId,
                        readyAt: null,
                        currentJobId: null,
                    }, { merge: true });
                } else {
                    runnerStatus = currentStatus;
                    console.log(`🟢 Runner ${currentStatus}, job queued`);
                }
            });

            if (workflowTriggered) {
                const githubToken = process.env.GITHUB_TOKEN;
                const githubOwner = process.env.GITHUB_OWNER;
                const githubRepo = process.env.GITHUB_REPO;

                if (!githubToken || !githubOwner || !githubRepo) {
                    console.error(`❌ Missing GitHub env vars: TOKEN=${!!githubToken}, OWNER=${!!githubOwner}, REPO=${!!githubRepo}`);
                    await runnerDocRef.set({ status: 'inactive', lastActive: Date.now() }, { merge: true });
                    runnerStatus = 'error';
                } else {
                    try {
                        const dispatchUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/main.yml/dispatches`;
                        const dispatchRes = await fetch(dispatchUrl, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${githubToken}`,
                                Accept: 'application/vnd.github+json',
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ ref: 'main' }),
                        });

                        if (dispatchRes.ok) {
                            console.log(`✅ Workflow dispatched for job ${jobId}`);
                        } else {
                            const errorText = await dispatchRes.text();
                            console.error(`⚠️ Failed to dispatch workflow: ${dispatchRes.status} ${errorText}`);
                            await runnerDocRef.set({ status: 'inactive', lastActive: Date.now() }, { merge: true });
                            runnerStatus = 'inactive';
                        }
                    } catch (ghError) {
                        console.error('⚠️ GitHub dispatch error:', ghError);
                        await runnerDocRef.set({ status: 'inactive', lastActive: Date.now() }, { merge: true });
                        runnerStatus = 'inactive';
                    }
                }
            }
        } catch (runnerCheckError) {
            console.error('⚠️ Runner check failed:', runnerCheckError);
        }

        return NextResponse.json({ jobId, runnerStatus }, { status: 201 });

    } catch (err) {
        console.error('Submit job error:', err);
        const message = err instanceof Error ? err.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
