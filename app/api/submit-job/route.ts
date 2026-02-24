import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Use REST API approach for server-side Firestore operations
// to avoid admin SDK complexity — we'll use the client REST API

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { script, formats } = body;

        // Validate
        if (!script || typeof script !== 'string') {
            return NextResponse.json(
                { error: 'Script is required' },
                { status: 400 }
            );
        }

        if (!formats || !Array.isArray(formats) || formats.length === 0) {
            return NextResponse.json(
                { error: 'At least one format must be selected' },
                { status: 400 }
            );
        }

        const validFormats = ['glb', 'fbx', 'stl', 'obj', 'usd'];
        const invalidFormats = formats.filter((f: string) => !validFormats.includes(f));
        if (invalidFormats.length > 0) {
            return NextResponse.json(
                { error: `Invalid formats: ${invalidFormats.join(', ')}` },
                { status: 400 }
            );
        }

        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

        if (!projectId || !apiKey) {
            return NextResponse.json(
                { error: 'Firebase configuration missing' },
                { status: 500 }
            );
        }

        // Create job document via Firestore REST API
        const jobData = {
            fields: {
                script: { stringValue: script },
                userId: { stringValue: 'anonymous' },
                status: { stringValue: 'queued' },
                formats: {
                    arrayValue: {
                        values: formats.map((f: string) => ({ stringValue: f })),
                    },
                },
                outputs: { mapValue: { fields: {} } },
                createdAt: { integerValue: String(Date.now()) },
            },
        };

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/jobs?key=${apiKey}`;

        const firestoreRes = await fetch(firestoreUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobData),
        });

        if (!firestoreRes.ok) {
            const errData = await firestoreRes.text();
            console.error('Firestore error:', errData);
            return NextResponse.json(
                { error: 'Failed to create job in Firestore' },
                { status: 500 }
            );
        }

        const createdDoc = await firestoreRes.json();
        // Extract job ID from the document name
        // name format: "projects/{project}/databases/(default)/documents/jobs/{jobId}"
        const docName: string = createdDoc.name;
        const jobId = docName.split('/').pop()!;

        // Try to trigger GitHub Actions workflow
        const githubToken = process.env.GITHUB_TOKEN;
        const githubOwner = process.env.GITHUB_OWNER;
        const githubRepo = process.env.GITHUB_REPO;

        if (githubToken && githubOwner && githubRepo) {
            // Check if any job is currently processing
            const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
            const queryBody = {
                structuredQuery: {
                    from: [{ collectionId: 'jobs' }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'status' },
                            op: 'EQUAL',
                            value: { stringValue: 'processing' },
                        },
                    },
                    limit: 1,
                },
            };

            const queryRes = await fetch(queryUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(queryBody),
            });

            let hasProcessingJob = false;
            if (queryRes.ok) {
                const queryData = await queryRes.json();
                hasProcessingJob = queryData.some(
                    (r: { document?: unknown }) => r.document
                );
            }

            if (!hasProcessingJob) {
                try {
                    const dispatchUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/blender-worker.yml/dispatches`;
                    const dispatchRes = await fetch(dispatchUrl, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${githubToken}`,
                            Accept: 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            ref: 'main',
                            inputs: { job_id: jobId },
                        }),
                    });

                    if (!dispatchRes.ok) {
                        console.error(
                            'GitHub Actions dispatch failed:',
                            dispatchRes.status,
                            await dispatchRes.text()
                        );
                    }
                } catch (ghError) {
                    console.error('GitHub Actions trigger error:', ghError);
                    // Don't fail the job creation if GH trigger fails
                }
            }
        }

        return NextResponse.json({ jobId }, { status: 201 });
    } catch (err) {
        console.error('Submit job error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
