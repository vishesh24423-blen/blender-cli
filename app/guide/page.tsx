'use client';

import Link from 'next/link';
import { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

const examples = [
  {
    name: 'Simple Cube',
    description: 'Basic mesh creation with material',
    code: `import bpy

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "SimpleCube"

mat = bpy.data.materials.new("CubeMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.3, 1.0)
cube.data.materials.append(mat)

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
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
texture = nodes.new('ShaderNodeTexNoise')
colorRamp = nodes.new('ShaderNodeValRamp')

links.new(texture.outputs['Fac'], colorRamp.inputs['Fac'])
links.new(colorRamp.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

bsdf.inputs['Roughness'].default_value = 0.3
texture.inputs['Scale'].default_value = 5.0

sphere.data.materials.append(mat)
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
                <p>Your script should <strong>ONLY create geometry</strong>. Let BlenderLab handle everything else.</p>
              </div>
            </section>

            {/* DON'T */}
            <section className="guide-section">
              <h2 className="guide-section-title guide-section-title--danger">DON'T Include</h2>
              <div className="guide-grid">
                {[
                  { title: 'Scene Clearing', code: `bpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete()`, reason: 'Worker handles this automatically' },
                  { title: 'Export Code', code: `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB')`, reason: 'Worker handles export' },
                  { title: 'Render Settings', code: `scene.render.engine = 'CYCLES'`, reason: 'Worker sets optimal settings' },
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
            </section>

            {/* DO */}
            <section className="guide-section">
              <h2 className="guide-section-title guide-section-title--success">DO Include</h2>
              <div className="guide-grid">
                {[
                  { title: 'Geometry Creation', code: `bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))` },
                  { title: 'Materials', code: `mat = bpy.data.materials.new("MyMaterial")\nmat.use_nodes = True` },
                  { title: 'Modifiers', code: `bevel = cube.modifiers.new("Bevel", 'BEVEL')\nbevel.width = 0.1` },
                  { title: 'Smooth Shading', code: `bpy.ops.object.shade_smooth()` },
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
              <h2 className="guide-section-title">Pro Tips</h2>
              <div className="guide-tips-list">
                {[
                  'Use descriptive object names (cube.name = "MyObject")',
                  'Call bpy.ops.object.shade_smooth() on mesh objects',
                  'Use materials to add color and realism',
                  'Test your script locally before submitting',
                  'Use print() statements for debugging',
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
