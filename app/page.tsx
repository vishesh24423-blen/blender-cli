import RunnerStatus from '@/components/RunnerStatus';
import ScriptSubmitForm from '@/components/ScriptSubmitForm';
import Link from 'next/link';
import { Code2, Cpu, Download } from 'lucide-react';

const FEATURES = [
  {
    icon: Code2,
    title: 'Write Script',
    desc: 'Write your Blender Python script using the full bpy API. Create meshes, materials, and geometry — anything Blender can do.',
  },
  {
    icon: Cpu,
    title: 'Queue & Process',
    desc: 'Your script is queued and executed by Blender running headlessly on GitHub Actions with automatic Spline-quality upgrades.',
  },
  {
    icon: Download,
    title: 'Download & View',
    desc: 'Get your 3D models in GLB, FBX, STL, or USD. Interactive 3D viewer lets you inspect results right in the browser.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">
          <span>✦</span>
          Powered by Blender + GitHub Actions
        </div>

        <h1 className="hero-title">
          Generate 3D Assets<br />from Python Scripts
        </h1>

        <p className="hero-subtitle">
          Write a Blender Python script, choose your output formats, and let our
          headless pipeline generate production-ready models with HDRI lighting,
          PBR materials, and cinematic post-processing.
        </p>

        <RunnerStatus />
      </section>

      {/* Submit Form */}
      <ScriptSubmitForm />

      {/* Which scripts work — landing cheat-sheet (full guide at /guide) */}
      <section className="features" style={{ marginTop: '8px' }}>
        <h2 className="features-title">Which scripts work?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3 className="feature-name">✅ Just build meshes</h3>
            <p className="feature-desc">
              Use <code>bpy.ops.mesh.primitive_*</code>, <code>from_pydata</code>, or <code>bmesh</code> +{' '}
              <code>collection.objects.link(obj)</code>. Leave ≥1 MESH object in the scene — the worker exports it.
            </p>
          </div>
          <div className="feature-card">
            <h3 className="feature-name">🚫 Don&apos;t export / render</h3>
            <p className="feature-desc">
              No <code>bpy.ops.export_*</code>, no <code>bpy.ops.render.render</code>, no{' '}
              <code>render.engine = ...</code>, no <code>sys.exit</code>, no <code>--output-dir</code> args.
              The worker does clear → camera/HDRI → your code → export → preview.
            </p>
          </div>
          <div className="feature-card">
            <h3 className="feature-name">⏱️ First run is slow</h3>
            <p className="feature-desc">
              Cold start wakes GitHub Actions (snap install + Blender boot, ~60–90s). Your job stays{' '}
              <code>queued</code> → <code>processing</code> automatically. Track it on the job page.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <h2 className="features-title">How it works</h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">
                <f.icon size={22} />
              </div>
              <h3 className="feature-name">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guide CTA */}
      <section style={{ marginBottom: '80px', marginTop: '16px' }}>
        <div className="guide-cta">
          <h2>New to BlenderLab?</h2>
          <p>
            Learn the golden rules of script writing, explore examples, and master the patterns that produce stunning 3D assets.
          </p>
          <Link href="/guide" className="guide-link">
            Read the Script Writing Guide →
          </Link>
        </div>
      </section>
    </>
  );
}
