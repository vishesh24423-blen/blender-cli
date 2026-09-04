'use client';

import Link from 'next/link';
import { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

const examples = [
  {
    name: 'Simple Cube',
    description: 'Basic mesh creation with material (Blender 5.x-safe)',
    code: `import bpy

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "SimpleCube"

mat = bpy.data.materials.new("CubeMaterial")
if not mat.use_nodes:
    mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
if bsdf is not None and 'Base Color' in bsdf.inputs:
    bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.3, 1.0)
cube.data.materials.append(mat)

bpy.context.view_layer.objects.active = cube
bpy.ops.object.shade_smooth()
print("✅ Cube created")`,
  },
  {
    name: 'Array of Objects',
    description: 'Procedurally generate multiple objects',
    code: `import bpy, math

for i in range(12):
    angle = (i / 12) * math.pi * 2
    x = math.cos(angle) * 3
    y = math.sin(angle) * 3
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.4, location=(x, y, 0))
    sphere = bpy.context.active_object
    sphere.name = f"Sphere_{i}"
    bpy.context.view_layer.objects.active = sphere
    bpy.ops.object.shade_smooth()

print("✅ Created 12 spheres")`,
  },
  {
    name: 'Custom Material',
    description: 'Procedural material with noise texture',
    code: `import bpy

bpy.ops.mesh.primitive_uv_sphere_add(radius=2, location=(0, 0, 0))
sphere = bpy.context.active_object

mat = bpy.data.materials.new("ProceduralMaterial")
if not mat.use_nodes:
    mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
texture = nodes.new('ShaderNodeTexNoise')
colorRamp = nodes.new('ShaderNodeValToRGB')

links.new(texture.outputs['Fac'], colorRamp.inputs['Fac'])
links.new(colorRamp.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

if 'Roughness' in bsdf.inputs:
    bsdf.inputs['Roughness'].default_value = 0.3
if 'Scale' in texture.inputs:
    texture.inputs['Scale'].default_value = 5.0

sphere.data.materials.append(mat)
bpy.context.view_layer.objects.active = sphere
bpy.ops.object.shade_smooth()
print("✅ Sphere with procedural material")`,
  },
  {
    name: 'Modifier Stack',
    description: 'Stack multiple modifiers for complex geometry',
    code: `import bpy

bpy.ops.mesh.primitive_cylinder_add(
    vertices=6, radius=1, depth=2, location=(0, 0, 0)
)
obj = bpy.context.active_object
obj.name = "ModifiedCylinder"

bevel = obj.modifiers.new('Bevel', 'BEVEL')
bevel.width = 0.1
bevel.segments = 3

array = obj.modifiers.new('Array', 'ARRAY')
array.count = 3
array.relative_offset_displace[0] = 2.5

bpy.context.view_layer.objects.active = obj
bpy.ops.object.shade_smooth()
print("✅ Cylinder with modifiers")`,
  },
];

export default function ScriptGuidePage() {
  const [activeTab, setActiveTab] = useState<'guide' | 'examples'>('guide');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {}
  };

  return (
    <div className="guide-page-root">
      {/* Header */}
      <div className="guide-header">
        <div className="guide-header-left">
          <h1 className="guide-title">Script Writing Guide</h1>
          <p className="guide-subtitle">Learn how to write scripts for BlenderLab</p>
        </div>
        <Link href="/" className="guide-back-link">
          ← Back Home
        </Link>
      </div>

      {/* Tabs */}
      <div className="guide-tabs">
        <button
          onClick={() => setActiveTab('guide')}
          className={`guide-tab ${activeTab === 'guide' ? 'guide-tab--active' : ''}`}
        >
          Guide
        </button>
        <button
          onClick={() => setActiveTab('examples')}
          className={`guide-tab ${activeTab === 'examples' ? 'guide-tab--active' : ''}`}
        >
          Examples ({examples.length})
        </button>
      </div>

      {/* Content */}
      <div className="guide-content">
        {activeTab === 'guide' && (
          <div>
            {/* Golden Rule */}
            <section className="guide-section">
              <h2 className="guide-section-title">Golden Rule</h2>
              <div className="guide-tip guide-tip--success">
                <p>Your script should <strong>ONLY create geometry</strong>. Let BlenderLab handle everything else (scene clear, camera, lighting, export, preview).</p>
              </div>
            </section>

            {/* WHICH SCRIPTS WORK */}
            <section className="guide-section">
              <h2 className="guide-section-title guide-section-title--success">✅ Which Python scripts work?</h2>
              <div className="guide-tip guide-tip--success">
                <p><strong>Any script that creates meshes and stops.</strong> The worker wraps your code as: clear scene → preamble (camera + HDRI) → <em>your script</em> → post-pass → export → preview. If your code leaves ≥1 MESH object behind, it exports.</p>
              </div>
              <div className="guide-grid">
                {[
                  { title: '✅ bpy.ops primitives', code: `bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))\ncube = bpy.context.active_object\ncube.name = "MyCube"`, reason: 'Most reliable' },
                  { title: '✅ from_pydata', code: `mesh = bpy.data.meshes.new("M")\nmesh.from_pydata(verts, [], faces)\nmesh.update()\nobj = bpy.data.objects.new("Obj", mesh)\nbpy.context.scene.collection.objects.link(obj)`, reason: 'Fully supported' },
                  { title: '✅ bmesh', code: `import bmesh\nbm = bmesh.new()\n# ... build verts/faces ...\nmesh = bpy.data.meshes.new("M")\nbm.to_mesh(mesh)\nbm.free()\nobj = bpy.data.objects.new("Obj", mesh)\nbpy.context.scene.collection.objects.link(obj)`, reason: 'Must link object' },
                  { title: '✅ Modifiers + materials', code: `cube.modifiers.new("Subdiv", 'SUBSURF')\nmat = bpy.data.materials.new("M")\nif not mat.use_nodes:\n    mat.use_nodes = True  # Blender 6.0 deprecates unconditional set`, reason: 'Guard socket names' },
                ].map((item, idx) => (
                  <div key={idx} className="guide-card">
                    <div className="guide-card-header">
                      <span className="guide-card-title">{item.title}</span>
                      <span className="guide-card-reason">{item.reason}</span>
                    </div>
                    <SyntaxHighlighter language="python" style={atomOneDark} customStyle={{ padding: '12px', borderRadius: '6px', fontSize: '12px', margin: 0 }}>
                      {item.code}
                    </SyntaxHighlighter>
                  </div>
                ))}
              </div>
            </section>

            {/* DON'T */}
            <section className="guide-section">
              <h2 className="guide-section-title guide-section-title--danger">❌ DON&apos;T Include (breaks jobs)</h2>
              <div className="guide-grid">
                {[
                  { title: 'Own export', code: `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB')`, reason: 'Worker exports — yours exports nothing (esp. use_selection=True with no selection)' },
                  { title: 'Own render', code: `bpy.ops.render.render(write_still=True)`, reason: 'Worker renders preview (with camera)' },
                  { title: 'Engine override', code: `scene.render.engine = 'BLENDER_EEVEE_NEXT'  # crashes on Blender 5.2\nscene.render.engine = 'CYCLES'`, reason: "5.2 only has BLENDER_EEVEE / WORKBENCH / CYCLES" },
                  { title: 'Exit / quit', code: `sys.exit(1)\nquit()\nbpy.ops.wm.quit_blender()`, reason: 'Kills job before export' },
                  { title: 'CLI args', code: `argparse / sys.argv --output-dir`, reason: 'Runner calls blender with no extra args' },
                  { title: 'Scene reload', code: `bpy.ops.wm.read_factory_settings()\nbpy.ops.wm.read_homefile()\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete()`, reason: 'Wipes preamble camera + lighting' },
                ].map((item, idx) => (
                  <div key={idx} className="guide-card guide-card--danger">
                    <div className="guide-card-header">
                      <span className="guide-card-title">{item.title}</span>
                      <span className="guide-card-reason">{item.reason}</span>
                    </div>
                    <SyntaxHighlighter language="python" style={atomOneDark} customStyle={{ padding: '12px', borderRadius: '6px', fontSize: '12px', margin: 0 }}>
                      {item.code}
                    </SyntaxHighlighter>
                  </div>
                ))}
              </div>
              <div className="guide-tip guide-tip--success" style={{ marginTop: '12px' }}>
                <p><strong>Fix for the classic &quot;dog script&quot; failure:</strong> delete your <code>bpy.ops.export_scene.gltf(..., use_selection=True)</code> block, delete the <code>--output-dir</code> / <code>if __name__ == &quot;__main__&quot;</code> wrapper, and just leave the geometry-building code at top level. The worker exports to <code>output.glb</code> itself.</p>
              </div>
            </section>

            {/* DO */}
            <section className="guide-section">
              <h2 className="guide-section-title guide-section-title--success">DO Include (Blender 5.x-safe patterns)</h2>
              <div className="guide-grid">
                {[
                  { title: 'Geometry Creation', code: `bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))` },
                  { title: 'Version-safe material', code: `mat = bpy.data.materials.new("MyMaterial")\nif not mat.use_nodes:\n    mat.use_nodes = True\nbsdf = mat.node_tree.nodes.get("Principled BSDF")\nif bsdf is not None and 'Base Color' in bsdf.inputs:\n    bsdf.inputs['Base Color'].default_value = (0.1, 0.5, 0.9, 1.0)` },
                  { title: 'Modifiers', code: `bevel = cube.modifiers.new("Bevel", 'BEVEL')\nbevel.width = 0.1` },
                  { title: 'Smooth Shading', code: `bpy.context.view_layer.objects.active = cube\nbpy.ops.object.shade_smooth()` },
                ].map((item, idx) => (
                  <div key={idx} className="guide-card">
                    <h3 className="guide-card-title">{item.title}</h3>
                    <SyntaxHighlighter language="python" style={atomOneDark} customStyle={{ padding: '12px', borderRadius: '6px', fontSize: '12px', margin: 0 }}>
                      {item.code}
                    </SyntaxHighlighter>
                  </div>
                ))}
              </div>
            </section>

            {/* Pro Tips */}
            <section className="guide-section">
              <h2 className="guide-section-title">Pro Tips (Blender 5.2)</h2>
              <div className="guide-tips-list">
                {[
                  'Use descriptive object names (cube.name = "MyObject")',
                  'Set the active object before shade_smooth: bpy.context.view_layer.objects.active = cube',
                  'Guard material sockets: if \'Base Color\' in bsdf.inputs — names change between versions',
                  'Only set mat.use_nodes = True when it is False (unconditional set warns on 5.2, removed in 6.0)',
                  'Never set render.engine yourself — BLENDER_EEVEE_NEXT does not exist on 5.2 (use BLENDER_EEVEE)',
                  'First run takes 60–90s (runner cold-start: snap install + Blender boot). Watch the job page, not just the landing badge.',
                  'Use print() statements for debugging — they appear in the GitHub Actions log',
                ].map((tip, idx) => (
                  <div key={idx} className="guide-tip-item">
                    <span className="guide-tip-arrow">→</span> {tip}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'examples' && (
          <div>
            <p className="guide-examples-intro">
              Ready-to-use script examples. Copy and paste these into the script editor to get started!
            </p>
            <div className="guide-grid">
              {examples.map((example, idx) => (
                <div key={idx} className="guide-card guide-card--example">
                  <div className="guide-card-header">
                    <div>
                      <h3 className="guide-card-title">{example.name}</h3>
                      <p className="guide-card-desc">{example.description}</p>
                    </div>
                    <button
                      onClick={() => handleCopy(example.code, idx)}
                      className="guide-copy-btn"
                    >
                      {copiedIdx === idx ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <SyntaxHighlighter language="python" style={atomOneDark} customStyle={{ padding: '16px', borderRadius: '6px', fontSize: '12px', lineHeight: '1.5' }}>
                    {example.code}
                  </SyntaxHighlighter>
                </div>
              ))}
            </div>

            <div className="guide-cta-section">
              <h3>Ready to Submit?</h3>
              <p>Copy any example above, paste it into the script editor, select your format, and click Generate.</p>
              <Link href="/" className="guide-cta-button">
                Go to Home & Submit →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
