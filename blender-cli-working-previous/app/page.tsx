import RunnerStatus from '@/components/RunnerStatus';
import ScriptSubmitForm from '@/components/ScriptSubmitForm';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">
          <span>⚡</span>
          Powered by Blender + GitHub Actions
        </div>

        <h1 className="hero-title">
          Generate 3D Assets<br />from Python Scripts
        </h1>

        <p className="hero-subtitle">
          Write a Blender Python script, choose your output formats, and let our
          headless Blender pipeline generate production-ready 3D models for you.
        </p>

        {/* Runner Status */}
        <RunnerStatus />

        {/* Guide CTA */}
        <div style={{ marginTop: '24px' }}>
          <Link
            href="/guide"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              color: '#3b82f6',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            📚 Read Script Writing Guide
          </Link>
        </div>
      </section>

      {/* Submit Form - NOW AT TOP */}
      <ScriptSubmitForm />

      {/* Info Section */}
      <section style={{ marginBottom: '60px', marginTop: '60px' }}>
        <div
          style={{
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff' }}>New to BlenderLab?</h2>
          <p style={{ margin: 0, color: '#888', fontSize: '14px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
            Check out our comprehensive guide with examples, best practices, and common patterns to write production-ready 3D asset generation scripts.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <h2 className="features-title">How it works</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
              📝
            </div>
            <h3 className="feature-name">Write Script</h3>
            <p className="feature-desc">
              Write your Blender Python script using the full bpy API.
              Create meshes, materials, animations — anything Blender can do.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
              ⚙️
            </div>
            <h3 className="feature-name">Queue & Process</h3>
            <p className="feature-desc">
              Your script is queued and executed by Blender running headlessly
              on a GitHub Actions runner with full GPU support.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>
              📦
            </div>
            <h3 className="feature-name">Download Files</h3>
            <p className="feature-desc">
              Get your 3D models in GLB, FBX, STL, OBJ, or USD format.
              Files are hosted on Cloudflare R2 for fast global downloads.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
