import RunnerStatus from '@/components/RunnerStatus';
import ScriptSubmitForm from '@/components/ScriptSubmitForm';

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
      </section>

      {/* Submit Form */}
      <ScriptSubmitForm />

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
