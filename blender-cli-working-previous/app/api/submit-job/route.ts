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

        // 2. Check and activate runner using Transaction (STRICT locking)
        try {
            const runnerDocRef = database.collection('system').doc('runner');

            let shouldTriggerWorkflow = false;
            let runnerStatus = 'inactive';

            await database.runTransaction(async (transaction) => {
                const runnerDoc = await transaction.get(runnerDocRef);
                const runnerData = runnerDoc.data();

                runnerStatus = runnerData?.status ?? 'inactive';
                const lastActive = runnerData?.lastActive ?? 0;
                const now = Date.now();

                // Trigger workflow if runner is NOT currently active
                // This includes: runner doesn't exist, runner is inactive, or runner is stale
                const isStale = now - lastActive > 5 * 60 * 1000; // 5 minutes without heartbeat

                if (runnerStatus !== 'active' || isStale) {
                    shouldTriggerWorkflow = true;
                    console.log(`🔴 Triggering runner: status=${runnerStatus}, stale=${isStale}`);
                    
                    // Atomically set runner to active with timestamps
                    transaction.set(runnerDocRef, {
                        status: 'active',
                        startedAt: now,
                        lastActive: now,
                        triggeredJobId: jobId,
                    }, { merge: true });
                } else {
                    console.log(`🟢 Runner already active, queueing job`);
                }
            });

            if (shouldTriggerWorkflow) {
                const githubToken = process.env.GITHUB_TOKEN;
                const githubOwner = process.env.GITHUB_OWNER;
                const githubRepo = process.env.GITHUB_REPO;

                // Check if all GitHub env vars are present
                if (!githubToken || !githubOwner || !githubRepo) {
                    console.error(`❌ CRITICAL: Cannot trigger workflow - Missing GitHub env vars!`);
                    console.error(`   GITHUB_TOKEN: ${githubToken ? '✓ set' : '✗ MISSING'}`);
                    console.error(`   GITHUB_OWNER: ${githubOwner ? '✓ set' : '✗ MISSING'}`);
                    console.error(`   GITHUB_REPO: ${githubRepo ? '✓ set' : '✗ MISSING'}`);
                    console.error(`   Job ${jobId} created but WILL NOT PROCESS until GitHub vars are set in Vercel`);
                    console.error(`   → Vercel Settings → Environment Variables → Add GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO`);
                } else {
                    try {
                        // --- PRIMARY CHECK: Verify NO active workflow already running ---
                        const runsUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/main.yml/runs?status=queued,in_progress&per_page=5`;
                        console.log(`🔍 Checking for active workflows...`);

                        try {
                            const runsRes = await fetch(runsUrl, {
                                headers: {
                                    Authorization: `Bearer ${githubToken}`,
                                    Accept: 'application/vnd.github+json',
                                },
                            });

                            if (runsRes.ok) {
                                const runsData = await runsRes.json();
                                const activeRuns = runsData.workflow_runs?.filter((run: any) => 
                                    run.status === 'queued' || run.status === 'in_progress'
                                ) || [];

                                if (activeRuns.length > 0) {
                                    console.log(`⏩ Found ${activeRuns.length} active workflow(s). NOT triggering new one.`);
                                    // Mark runner as active since workflow is already running
                                    await runnerDocRef.set({
                                        status: 'active',
                                        lastActive: Date.now(),
                                    }, { merge: true });
                                    return NextResponse.json({ jobId }, { status: 201 });
                                } else {
                                    console.log(`✅ No active workflows found. Will trigger new one.`);
                                }
                            } else {
                                console.warn(`⚠️ GitHub API returned ${runsRes.status}. Will attempt dispatch.`);
                            }
                        } catch (checkError) {
                            console.warn(`⚠️ GitHub API check failed: ${checkError}. Will attempt dispatch anyway.`);
                        }

                        // --- TRIGGER WORKFLOW ---
                        const dispatchUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/main.yml/dispatches`;
                        console.log(`📤 Dispatching workflow...`);

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
                            // Mark as inactive since trigger failed
                            await runnerDocRef.update({ status: 'inactive' });
                        }
                    } catch (ghError) {
                        console.error('⚠️ GitHub dispatch error:', ghError);
                        await runnerDocRef.update({ status: 'inactive' });
                    }
                }
            } else {
                console.log(`✅ Job ${jobId} queued — runner already ACTIVE (not triggering new workflow)`);
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
