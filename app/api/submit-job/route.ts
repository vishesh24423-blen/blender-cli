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

        const jobRef = await db.collection('jobs').add({
            script,
            userId: 'anonymous',
            status: 'queued',
            formats,
            outputs: {},
            createdAt: Date.now(),
        });

        const jobId = jobRef.id;

        const githubToken = process.env.GITHUB_TOKEN;
        const githubOwner = process.env.GITHUB_OWNER;
        const githubRepo = process.env.GITHUB_REPO;

        if (githubToken && githubOwner && githubRepo) {
            const processingSnap = await db.collection('jobs')
                .where('status', '==', 'processing')
                .limit(1)
                .get();

            if (processingSnap.empty) {
                try {
                    const dispatchUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/main.yml/dispatches`;

                    const dispatchRes = await fetch(dispatchUrl, {  // ← was missing this line
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${githubToken}`,
                            Accept: 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ ref: 'main' }),  // ← removed job_id input
                    });

                    if (!dispatchRes.ok) {
                        console.error('GitHub dispatch failed:', dispatchRes.status, await dispatchRes.text());
                    } else {
                        console.log('GitHub Actions triggered successfully');
                    }
                } catch (ghError) {
                    console.error('GitHub Actions trigger error:', ghError);
                }
            }
        }

        return NextResponse.json({ jobId }, { status: 201 });

    } catch (err) {
        console.error('Submit job error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
