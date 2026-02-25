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

        // 2. Check runner status in `runners/active`
        try {
            const runnerDocRef = db.collection('runners').doc('active');
            const runnerDoc = await runnerDocRef.get();
            const runnerStatus = runnerDoc.exists ? runnerDoc.data()?.status ?? 'inactive' : 'inactive';

            // 3. Only trigger workflow if runner is not active
            if (runnerStatus !== 'active') {
                const githubToken = process.env.GITHUB_TOKEN;
                const githubOwner = process.env.GITHUB_OWNER;
                const githubRepo = process.env.GITHUB_REPO;

                if (githubToken && githubOwner && githubRepo) {
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
                            console.log(`✅ Workflow triggered for job ${jobId} — runner was inactive`);
                            // Mark runner as active so subsequent jobs don't re-trigger
                            await runnerDocRef.set({
                                status: 'active',
                                startedAt: Date.now(),
                            });
                        } else {
                            console.error(`⚠️ Failed to trigger workflow: ${dispatchRes.status}`, await dispatchRes.text());
                        }
                    } catch (ghError) {
                        console.error('⚠️ GitHub workflow trigger failed:', ghError);
                    }
                }
            } else {
                console.log(`✅ Job ${jobId} queued — runner already active`);
            }
        } catch (runnerCheckError) {
            console.error('⚠️ Failed to check runner status:', runnerCheckError);
        }

        return NextResponse.json({ jobId }, { status: 201 });

    } catch (err) {
        console.error('Submit job error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
