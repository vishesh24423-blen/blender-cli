import { NextResponse } from 'next/server';

export async function GET() {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!token || !owner || !repo) {
        return NextResponse.json({
            available: false,
            error: 'GitHub env vars not configured',
        });
    }

    try {
        // Fetch latest workflow runs triggered by workflow_dispatch
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/runs?event=workflow_dispatch&per_page=3`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                },
                next: { revalidate: 10 },
            }
        );

        if (!res.ok) {
            return NextResponse.json({
                available: true,
                error: `GitHub API returned ${res.status}`,
                runs: [],
            });
        }

        const data = await res.json();
        const runs = (data.workflow_runs || []).map((run: any) => ({
            id: run.id,
            runNumber: run.run_number,
            status: run.status,
            conclusion: run.conclusion,
            htmlUrl: run.html_url,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            displayTitle: run.display_title,
            actor: run.actor?.login,
        }));

        return NextResponse.json({ available: true, runs });
    } catch (err) {
        return NextResponse.json({
            available: true,
            error: err instanceof Error ? err.message : 'Failed to fetch',
            runs: [],
        });
    }
}
