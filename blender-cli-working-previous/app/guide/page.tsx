'use client';

import Link from 'next/link';
import { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';

export default function ScriptGuidePage() {
  const [activeTab, setActiveTab] = useState<'guide' | 'examples'>('guide');

  const examples = [
    {
      name: 'Simple Cube',
      description: 'Basic mesh creation with material',
      code: `import bpy

# Create cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "SimpleCube"

# Add material
mat = bpy.data.materials.new("CubeMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.3, 1.0)
cube.data.materials.append(mat)

# Smooth shading
bpy.ops.object.shade_smooth()

print(f"✅ Cube created and ready for export")`,
    },
    {
      name: 'Array of Objects',
      description: 'Procedurally generate multiple objects',
      code: `import bpy
import math

# Create 12 spheres in a circle
for i in range(12):
    angle = (i / 12) * math.pi * 2
    x = math.cos(angle) * 3
    y = math.sin(angle) * 3
    
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.4,
        location=(x, y, 0)
    )
    sphere = bpy.context.active_object
    sphere.name = f"Sphere_{i}"
    bpy.ops.object.shade_smooth()

print(f"✅ Created 12 spheres in a circle")`,
    },
    {
      name: 'Custom Material',
      description: 'Procedural material with textures',
      code: `import bpy

# Create base geometry
bpy.ops.mesh.primitive_uv_sphere_add(radius=2, location=(0, 0, 0))
sphere = bpy.context.active_object

# Create detailed material
mat = bpy.data.materials.new("ProceduralMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

# Clear default
nodes.clear()

# Create nodes
output = nodes.new('ShaderNodeOutputMaterial')
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
texture = nodes.new('ShaderNodeTexNoise')
colorRamp = nodes.new('ShaderNodeValRamp')

# Connect nodes
links.new(texture.outputs['Fac'], colorRamp.inputs['Fac'])
links.new(colorRamp.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

# Configure
bsdf.inputs['Roughness'].default_value = 0.3
texture.inputs['Scale'].default_value = 5.0

sphere.data.materials.append(mat)
bpy.ops.object.shade_smooth()

print(f"✅ Sphere with procedural material created")`,
    },
    {
      name: 'Modifier Stack',
      description: 'Stack multiple modifiers for complex geometry',
      code: `import bpy

# Create base cylinder
bpy.ops.mesh.primitive_cylinder_add(
    vertices=6,
    radius=1,
    depth=2,
    location=(0, 0, 0)
)
obj = bpy.context.active_object
obj.name = "ModifiedCylinder"

# Add modifiers
# Bevel edges
bevel = obj.modifiers.new('Bevel', 'BEVEL')
bevel.width = 0.1
bevel.segments = 3

# Array modifier
array = obj.modifiers.new('Array', 'ARRAY')
array.count = 3
array.relative = True
array.relative_offset_displace[0] = 2.5

# Apply smooth shading last
bpy.ops.object.shade_smooth()

print(f"✅ Cylinder with bevel and array modifiers created")`,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e27' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '20px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>📚 Script Writing Guide</h1>
          <p style={{ margin: '5px 0 0 0', color: '#888' }}>Learn how to write scripts for BlenderLab</p>
        </div>
        <Link
          href="/"
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            textDecoration: 'none',
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }}
        >
          ← Back Home
        </Link>
      </header>

      {/* Navigation Tabs */}
      <div
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0 40px',
          display: 'flex',
          gap: '30px',
        }}
      >
        <button
          onClick={() => setActiveTab('guide')}
          style={{
            padding: '16px 0',
            border: 'none',
            background: 'none',
            color: activeTab === 'guide' ? '#3b82f6' : '#888',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'guide' ? 600 : 400,
            borderBottom: activeTab === 'guide' ? '2px solid #3b82f6' : 'none',
          }}
        >
          📖 Guide
        </button>
        <button
          onClick={() => setActiveTab('examples')}
          style={{
            padding: '16px 0',
            border: 'none',
            background: 'none',
            color: activeTab === 'examples' ? '#3b82f6' : '#888',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'examples' ? 600 : 400,
            borderBottom: activeTab === 'examples' ? '2px solid #3b82f6' : 'none',
          }}
        >
          💡 Examples ({examples.length})
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '40px 40px', maxWidth: '1000px' }}>
        {activeTab === 'guide' && (
          <div>
            {/* Golden Rule */}
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#fff' }}>🎯 Golden Rule</h2>
              <div
                style={{
                  padding: '20px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  borderLeft: '4px solid #22c55e',
                }}
              >
                <p style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 500 }}>
                  Your script should <strong>ONLY create geometry</strong>. Let BlenderLab handle everything else.
                </p>
              </div>
            </section>

            {/* DON'T Section */}
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#ef4444' }}>❌ DON'T Include</h2>

              <div style={{ display: 'grid', gap: '20px' }}>
                {[
                  {
                    title: 'Scene Clearing',
                    code: `bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for col in bpy.data.collections:
    bpy.data.collections.remove(col)`,
                    reason: 'Worker handles this automatically',
                  },
                  {
                    title: 'Collection Setup',
                    code: `if "Collection" not in bpy.data.collections:
    bpy.data.collections.new("Collection")`,
                    reason: 'Worker sets this up automatically',
                  },
                  {
                    title: 'Export Code',
                    code: `bpy.ops.export_scene.gltf(
    filepath=export_path,
    export_format='GLB'
)`,
                    reason: 'Worker handles export automatically',
                  },
                  {
                    title: 'Render Settings',
                    code: `scene.render.engine = 'CYCLES'
scene.cycles.samples = 256`,
                    reason: 'Optional; worker handles if needed',
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '20px',
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '8px',
                    }}
                  >
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#fca5a5' }}>
                      {item.title}
                    </h3>
                    <p style={{ margin: '0 0 12px 0', color: '#999', fontSize: '13px' }}>{item.reason}</p>
                    <SyntaxHighlighter
                      language="python"
                      style={atomOneDark}
                      customStyle={{
                        padding: '12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        margin: 0,
                      }}
                    >
                      {item.code}
                    </SyntaxHighlighter>
                  </div>
                ))}
              </div>
            </section>

            {/* DO Section */}
            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#22c55e' }}>✅ DO Include</h2>

              <div style={{ display: 'grid', gap: '20px' }}>
                {[
                  {
                    title: 'Geometry Creation',
                    code: `import bpy

bpy.ops.mesh.primitive_cube_add(
    size=2,
    location=(0, 0, 0)
)
cube = bpy.context.active_object`,
                  },
                  {
                    title: 'Materials',
                    code: `mat = bpy.data.materials.new("MyMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.2, 0.8, 0.3, 1.0)
cube.data.materials.append(mat)`,
                  },
                  {
                    title: 'Modifiers',
                    code: `bevel = cube.modifiers.new("Bevel", 'BEVEL')
bevel.width = 0.1
bevel.segments = 3`,
                  },
                  {
                    title: 'Smooth Shading',
                    code: `bpy.ops.object.shade_smooth()`,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '20px',
                      background: 'rgba(34, 197, 94, 0.05)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      borderRadius: '8px',
                    }}
                  >
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#86efac' }}>
                      {item.title}
                    </h3>
                    <SyntaxHighlighter
                      language="python"
                      style={atomOneDark}
                      customStyle={{
                        padding: '12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        margin: 0,
                      }}
                    >
                      {item.code}
                    </SyntaxHighlighter>
                  </div>
                ))}
              </div>
            </section>

            {/* Tips */}
            <section>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', color: '#fff' }}>💡 Pro Tips</h2>

              <div style={{ display: 'grid', gap: '12px' }}>
                {[
                  '✅ Always use descriptive object names (cube.name = "MyObject")',
                  '✅ Call bpy.ops.object.shade_smooth() on mesh objects for better quality',
                  '✅ Use materials to add color and realism to your models',
                  '🔴 SELECT ALL MESH OBJECTS AT THE END — This is critical for BlenderLab to export them!',
                  '✅ Test your script locally in Blender before submitting to BlenderLab',
                  '✅ Use print() statements to debug and understand what your script is doing',
                  '✅ Create multiple objects if needed — BlenderLab will export all of them',
                ].map((tip, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 16px',
                      background: tip.includes('SELECT ALL MESH') 
                        ? 'rgba(239, 68, 68, 0.08)' 
                        : 'rgba(59, 130, 246, 0.05)',
                      border: tip.includes('SELECT ALL MESH')
                        ? '1px solid rgba(239, 68, 68, 0.3)'
                        : '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: tip.includes('SELECT ALL MESH') ? '#fca5a5' : '#94adc8',
                      fontWeight: tip.includes('SELECT ALL MESH') ? 600 : 400,
                    }}
                  >
                    {tip}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'examples' && (
          <div>
            <p style={{ color: '#888', marginBottom: '30px' }}>
              Ready-to-use script examples. Copy and paste these into the script editor to get started!
            </p>

            <div style={{ display: 'grid', gap: '30px' }}>
              {examples.map((example, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '24px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600 }}>{example.name}</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>{example.description}</p>
                  </div>

                  <SyntaxHighlighter
                    language="python"
                    style={atomOneDark}
                    customStyle={{
                      padding: '16px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      lineHeight: '1.5',
                    }}
                  >
                    {example.code}
                  </SyntaxHighlighter>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(example.code);
                      alert('✅ Copied to clipboard!');
                    }}
                    style={{
                      marginTop: '12px',
                      padding: '8px 14px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#3b82f6',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    📋 Copy Code
                  </button>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '40px',
                padding: '20px',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px',
              }}
            >
              <h3 style={{ margin: '0 0 8px 0', color: '#3b82f6', fontSize: '14px', fontWeight: 600 }}>
                💾 Ready to Submit?
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>
                Copy any example above, paste it into the script editor on the home page, select your output format,
                and click Submit. Your 3D model will be generated in seconds!
              </p>
              <Link
                href="/"
                style={{
                  display: 'inline-block',
                  marginTop: '12px',
                  padding: '10px 16px',
                  background: '#3b82f6',
                  color: '#fff',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Go to Home & Submit
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
