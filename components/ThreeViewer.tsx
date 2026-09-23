'use client'

import { useEffect, useState } from 'react'

// React 19 assigns props on custom elements as *properties* when a matching
// property exists on the element instance, and only falls back to attributes
// otherwise. <model-viewer> declares camelCase properties (autoRotate,
// cameraControls, toneMapping, ...), so the kebab-case names used previously
// (auto-rotate, camera-controls, tone-mapping) were written to string keys the
// element never reads - the viewer rendered but ignored every setting.
// Everything below therefore uses camelCase property names.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string
        alt?: string
        poster?: string
        loading?: 'auto' | 'lazy' | 'eager'
        reveal?: 'auto' | 'manual'
        toneMapping?: string
        shadowIntensity?: string
        shadowSoftness?: string
        exposure?: string
        cameraControls?: boolean
        autoRotate?: boolean
        autoRotateDelay?: string
        rotationPerSecond?: string
        environmentImage?: string
        skyboxImage?: string
        interactionPrompt?: string
        cameraOrbit?: string
        minCameraOrbit?: string
        maxCameraOrbit?: string
        style?: React.CSSProperties
      }, HTMLElement>
    }
  }
}

interface ThreeViewerProps {
  glbUrl: string
  previewUrl?: string
  className?: string
  autoRotate?: boolean
}

export default function ThreeViewer({
  glbUrl,
  previewUrl,
  className = '',
  autoRotate = true,
}: ThreeViewerProps) {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Load the model-viewer custom element once, and track when it is upgraded.
  // React renders <model-viewer> on the first pass; until the module defines the
  // element it is just an unknown inline element, so we re-render after the
  // upgrade to make sure the element picks up its properties.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const markReady = () => {
      if (!cancelled) setReady(true)
    }

    if (customElements.get('model-viewer')) {
      markReady()
      return () => {
        cancelled = true
      }
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-model-viewer]'
    )
    if (!existing) {
      const script = document.createElement('script')
      script.type = 'module'
      script.dataset.modelViewer = 'true'
      script.src =
        'https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js'
      document.head.appendChild(script)
    }

    // Resolve as soon as the element is defined, so the viewer becomes
    // interactive even if `load` fired before React attached its listeners.
    customElements.whenDefined('model-viewer').then(markReady).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  // If the GLB never loads (bad R2 URL, CORS, offline), surface it instead of
  // spinning forever.
  useEffect(() => {
    if (loaded || failed) return
    const timer = setTimeout(() => {
      setFailed((prev) => prev ?? 'Model is taking too long to load.')
    }, 30_000)
    return () => clearTimeout(timer)
  }, [loaded, failed])

  const progressPct = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${className}`}
      style={{ background: 'linear-gradient(135deg, #0a0b0f 0%, #0f0f1e 50%, #0a0b0f 100%)' }}
    >
      <model-viewer
        src={glbUrl}
        {...(previewUrl ? { poster: previewUrl } : {})}
        alt="3D model preview"
        loading="eager"
        reveal="auto"
        toneMapping="aces"
        shadowIntensity="1.6"
        shadowSoftness="1.0"
        exposure="1.3"
        cameraControls
        autoRotate={autoRotate}
        autoRotateDelay="800"
        rotationPerSecond="16deg"
        environmentImage="neutral"
        interactionPrompt="none"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '520px',
          backgroundColor: 'transparent',
          '--poster-color': 'transparent',
        } as React.CSSProperties}
        onProgress={(e) => {
          const ce = e as unknown as CustomEvent<{ totalProgress: number }>
          setProgress(Math.round((ce.detail?.totalProgress ?? 0) * 100))
        }}
        onLoad={() => {
          setLoaded(true)
          setFailed(null)
        }}
        onError={() => setFailed('Could not load the 3D model file.')}
      >
        {/* model-viewer's progress-bar slot shows while the model downloads. */}
        <div slot="progress-bar" className="mv-progress-wrap">
          {previewUrl && (
            // Dynamic R2 preview URL — next/image would need remotePatterns config
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="mv-progress-poster" />
          )}
          <div className="mv-progress-content">
            <div className="mv-progress-ring">
              <svg viewBox="0 0 64 64" className="mv-progress-svg">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#ffffff10" strokeWidth="4"/>
                <circle
                  cx="32" cy="32" r="28"
                  fill="none" stroke="#7c3aed" strokeWidth="4"
                  strokeDasharray={`${(progressPct / 100) * 175.9} 175.9`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.3s ease' }}
                />
              </svg>
              <span className="mv-progress-pct">{progressPct}%</span>
            </div>
            <p className="mv-progress-label">Loading model</p>
          </div>
        </div>
      </model-viewer>

      {/* Overlay for the window before the custom element is upgraded. Without
          this the element is an unknown inline box and the viewer looks blank. */}
      {!loaded && (
        <div className="viewer-overlay">
          {failed ? (
            <>
              <span className="viewer-overlay-title">Viewer unavailable</span>
              <span className="viewer-overlay-hint">{failed}</span>
              <a href={glbUrl} download className="viewer-overlay-link">
                Download the GLB instead
              </a>
            </>
          ) : (
            <>
              <span className="viewer-overlay-title">
                {ready ? 'Loading model…' : 'Starting 3D viewer…'}
              </span>
              <span className="viewer-overlay-hint">
                You can download the file below while it loads.
              </span>
            </>
          )}
        </div>
      )}

      {/* Bottom HUD bar */}
      <div
        className="absolute bottom-0 left-0 right-0 px-4 py-2.5 flex items-center justify-between pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/40 text-xs">Drag to rotate · Scroll to zoom · Right-click to pan</span>
        </div>
        <a
          href={glbUrl}
          download
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 pointer-events-auto"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 7L1.5 3.5h2V1h3v2.5h2L5 7zM1 8.5h8V10H1z"/>
          </svg>
          GLB
        </a>
      </div>
    </div>
  )
}
