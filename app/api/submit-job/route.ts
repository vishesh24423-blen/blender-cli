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
        const { script, formats } = body;

        if (!script || typeof script !== 'string') {
            return NextResponse.json({ error: 'Script is required' }, { status: 400 });
        }

        if (!formats || !Array.isArray(formats) || formats.length === 0) {
            return NextResponse.json({ error: 'At least one format must be selected' }, { status: 400 });
        }

        const validFormats = ['glb', 'fbx', 'stl', 'obj', 'usd'];
        const invalidFormats = formats.filter((f: string) => !validFormats.includes(f));
        if (invalidFormats.length > 0) {
            return NextResponse.json({ error: `Invalid formats: ${invalidFormats.join(', ')}` }, { status: 400 });
        }

        // 1. Create job in Firestore (always queued)
        const jobRef = await database.collection('jobs').add({
            script,
            userId: 'anonymous',
            status: 'queued',
            formats,
            outputs: {},
            createdAt: Date.now(),
            error: null,
        });

        const jobId = jobRef.id;
        console.log(`📝 Job created: ${jobId} (${formats.join(", ")})`);

        // 2. Check and activate runner using Transaction
        try {
            const runnerDocRef = database.collection('system').doc('runner');

            let shouldTriggerWorkflow = false;

            await database.runTransaction(async (transaction) => {
                const runnerDoc = await transaction.get(runnerDocRef);
                const runnerData = runnerDoc.data();

                const runnerStatus = runnerData?.status ?? 'inactive';
                const lastActive = runnerData?.lastActive ?? 0;
                const isStale = Date.now() - lastActive > 5 * 60 * 1000; // 5 minutes

                if (runnerStatus !== 'active' || isStale) {
                    shouldTriggerWorkflow = true;
                    // Pre-emptively set to active so other transactions see it's "taken"
                    transaction.set(runnerDocRef, {
                        status: 'active',
                        startedAt: Date.now(),
                        lastActive: Date.now(), // Initial heartbeat
                    }, { merge: true });
                }
            });

            if (shouldTriggerWorkflow) {
                const githubToken = process.env.GITHUB_TOKEN;
                const githubOwner = process.env.GITHUB_OWNER;
                const githubRepo = process.env.GITHUB_REPO;

                if (githubToken && githubOwner && githubRepo) {
                    try {
                        // --- SECONDARY GUARD: Check GitHub API for active runs ---
                        const runsUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/main.yml/runs?status=queued,in_progress&per_page=1`;
                        const runsRes = await fetch(runsUrl, {
                            headers: {
                                Authorization: `Bearer ${githubToken}`,
                                Accept: 'application/vnd.github+json',
                            },
                        });

                        if (runsRes.ok) {
                            const runsData = await runsRes.json();
                            if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
                                console.log(`⏩ Workflow already active on GitHub for job ${jobId}. Syncing Firestore.`);
                                // Run is already there, just ensure Firestore stays active
                                await runnerDocRef.set({
                                    status: 'active',
                                    lastActive: Date.now(),
                                }, { merge: true });
                                return NextResponse.json({ jobId }, { status: 201 });
                            }
                        }

                        // --- TRIGGER WORKFLOW ---
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
                            console.log(`✅ Workflow triggered for job ${jobId} — runner was inactive/stale`);
                        } else {
                            const errorText = await dispatchRes.text();
                            console.error(`⚠️ Failed to trigger workflow: ${dispatchRes.status}`, errorText);
                            await runnerDocRef.update({ status: 'inactive' });
                        }
                    } catch (ghError) {
                        console.error('⚠️ GitHub API check/trigger failed:', ghError);
                        await runnerDocRef.update({ status: 'inactive' });
                    }
                }
            } else {
                console.log(`✅ Job ${jobId} queued — runner already active`);
            }
        } catch (runnerCheckError) {
            console.error('⚠️ Transaction/Runner check failed:', runnerCheckError);
        }

        return NextResponse.json({ jobId }, { status: 201 });

    } catch (err) {
        console.error('Submit job error:', err);
        const message = err instanceof Error ? err.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
