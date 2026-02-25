import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)
        ),
    });
}

const db = admin.firestore();

export async function POST(request: NextRequest) {
    try {
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
        const jobRef = await db.collection('jobs').add({
            script,
            userId: 'anonymous',
            status: 'queued',
            formats,
            outputs: {},
            createdAt: Date.now(),
        });

        const jobId = jobRef.id;

        // 2. Check and activate runner using Transaction
        try {
            const runnerDocRef = db.collection('system').doc('runner');

            let shouldTriggerWorkflow = false;

            await db.runTransaction(async (transaction) => {
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
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
