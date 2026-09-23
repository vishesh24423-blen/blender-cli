/**
 * Reproduces the model-viewer prop-name bug in ThreeViewer.tsx.
 *
 * model-viewer declares camelCase JS *properties* (autoRotate, cameraControls,
 * toneMapping, ...). React 19 assigns custom-element props as properties when a
 * matching property exists, using the prop name verbatim. So passing the
 * kebab-case JSX attribute writes to a dead string key instead.
 *
 * Run: node scripts/repro_viewer_props.js
 */

// Stand-in for <model-viewer>: it defines camelCase properties, like the real element.
class FakeModelViewer {
  constructor() {
    this.autoRotate = false;
    this.cameraControls = false;
    this.toneMapping = undefined;
    this.shadowIntensity = 0;
    this.rotationPerSecond = '';
    this.environmentImage = undefined;
    this.autoRotateDelay = undefined;
    this.interactionPrompt = undefined;
    this.exposure = undefined;
    this.shadowSoftness = undefined;
  }
}

// React 19 client-side rule for custom elements:
//   "props that match a property on the Custom Element instance will be assigned
//    as properties, otherwise they will be assigned as attributes."
function applyReact19Props(el, props, log) {
  for (const [key, value] of Object.entries(props)) {
    if (key in el) {
      el[key] = value;          // matches a real property -> property assignment
      log.push(`property  ${key} = ${JSON.stringify(value)}`);
    } else {
      log.push(`attribute ${key} = ${JSON.stringify(value)}  (no such property!)`);
    }
  }
}

const kebabProps = {
  'tone-mapping': 'aces',
  'shadow-intensity': '1.6',
  'shadow-softness': '1.0',
  exposure: '1.3',
  'camera-controls': true,
  'auto-rotate': true,
  'auto-rotate-delay': '800',
  'rotation-per-second': '16deg',
  'environment-image': 'neutral',
};

// Exactly the prop names the fixed component passes (plus the two string
// attributes the element genuinely exposes as attributes: loading / reveal).
const camelProps = {
  toneMapping: 'aces',
  shadowIntensity: '1.6',
  shadowSoftness: '1.0',
  exposure: '1.3',
  cameraControls: true,
  autoRotate: true,
  autoRotateDelay: '800',
  rotationPerSecond: '16deg',
  environmentImage: 'neutral',
  interactionPrompt: 'none',
};

const logA = [];
const a = new FakeModelViewer();
applyReact19Props(a, kebabProps, logA);

const logB = [];
const b = new FakeModelViewer();
applyReact19Props(b, camelProps, logB);

console.log('=== CURRENT (kebab-case props) ===');
for (const l of logA) console.log('  ' + l);
console.log(`  -> autoRotate=${a.autoRotate} cameraControls=${a.cameraControls} toneMapping=${a.toneMapping}`);

console.log('\n=== FIXED (camelCase props) ===');
for (const l of logB) console.log('  ' + l);
console.log(`  -> autoRotate=${b.autoRotate} cameraControls=${b.cameraControls} toneMapping=${b.toneMapping}`);

const broken = a.autoRotate !== true || a.cameraControls !== true || a.toneMapping !== 'aces';
const fixed = b.autoRotate === true && b.cameraControls === true && b.toneMapping === 'aces';

console.log('\n=== RESULT ===');
console.log('kebab-case props produce a working element:', !broken ? 'yes' : 'NO (bug reproduced)');
console.log('camelCase props produce a working element:', fixed ? 'yes' : 'NO');

process.exit(fixed && broken ? 0 : 1);