import RunnerStatus from '@/components/RunnerStatus';
import ScriptSubmitForm from '@/components/ScriptSubmitForm';
import AiChat from '@/components/AiChat';
import Link from 'next/link';
import { Code2, Cpu, Download, CheckCircle2, Ban, Clock } from 'lucide-react';

const FEATURES = [
  {
    icon: Code2,
    title: 'Write Script',
    desc: 'Write your Blender Python script using the full bpy API. Create meshes, materials, and geometry — anything Blender can do.',
  },
  {
    icon: Cpu,
    title: 'Queue & Process',
    desc: 'Your script is queued and run in headless Blender on a GitHub Actions runner. No local install needed.',
  },
  {
    icon: Download,
    title: 'Download & View',
    desc: 'Get your 3D models in GLB, FBX, STL, or USD. A built-in 3D viewer lets you inspect the result in the browser.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <p className="hero-overline">Headless Blender 5.2 · GitHub Actions</p>

        <h1 className="hero-title">
          3D models from Blender Python scripts
        </h1>

        <p className="hero-subtitle">
          Paste a script that builds geometry, pick your output formats,
          and get model files back. The runner clears the scene, runs your
          code in Blender, and exports the result.
        </p>

        <RunnerStatus />
      </section>

      {/* Submit Form */}
      <AiChat />
      <ScriptSubmitForm />

      {/* Which scripts work — landing cheat-sheet (full guide at /guide) */}
      <section className="features" style={{ marginTop: '8px' }}>
        <h2 className="features-title">Which scripts work?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3 className="feature-name"><CheckCircle2 size={15} /> Just build meshes</h3>
            <p className="feature-desc">
              Use <code>bpy.ops.mesh.primitive_*</code>, <code>from_pydata</code>, or <code>bmesh</code> +{' '}
              <code>collection.objects.link(obj)</code>. Leave ≥1 MESH object in the scene — the worker exports it.
            </p>
          </div>
          <div className="feature-card">
            <h3 className="feature-name"><Ban size={15} /> Don&apos;t export or render</h3>
            <p className="feature-desc">
              No <code>bpy.ops.export_*</code>, no <code>bpy.ops.render.render</code>, no{' '}
              <code>render.engine = ...</code>, no <code>sys.exit</code>, no <code>--output-dir</code> args.
              The worker does clear → camera/HDRI → your code → export → preview.
            </p>
          </div>
          <div className="feature-card">
            <h3 className="feature-name"><Clock size={15} /> First run is slow</h3>
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
            The rules for writing scripts that export reliably, plus copy-paste examples.
          </p>
          <Link href="/guide" className="guide-link">
            Read the Script Writing Guide →
          </Link>
        </div>
      </section>
    </>
  );
}
