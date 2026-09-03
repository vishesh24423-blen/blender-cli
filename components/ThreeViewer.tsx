'use client'

import { useEffect, useState } from 'react'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string
        alt?: string
        poster?: string
        'tone-mapping'?: string
        'shadow-intensity'?: string
        'shadow-softness'?: string
        exposure?: string
        'camera-controls'?: boolean
        'auto-rotate'?: boolean
        'auto-rotate-delay'?: string
        'rotation-per-second'?: string
        'environment-image'?: string
        'skybox-image'?: string
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!customElements.get('model-viewer')) {
      const script = document.createElement('script')
      script.type = 'module'
      script.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js'
      document.head.appendChild(script)
    }
  }, [])

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${className}`}
      style={{ background: 'linear-gradient(135deg, #0a0b0f 0%, #0f0f1e 50%, #0a0b0f 100%)' }}
    >
      <model-viewer
        src={glbUrl}
        poster={previewUrl || ''}
        alt="3D model"
        tone-mapping="aces"
        shadow-intensity="1.6"
        shadow-softness="1.0"
        exposure="1.3"
        camera-controls
        auto-rotate={autoRotate}
        auto-rotate-delay="800"
        rotation-per-second="16deg"
        environment-image="neutral"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '520px',
          backgroundColor: 'transparent',
          '--poster-color': 'transparent',
        } as React.CSSProperties}
        onProgress={(e) => {
          const ce = e as unknown as CustomEvent<{ totalProgress: number }>;
          setProgress(Math.round((ce.detail?.totalProgress ?? 0) * 100));
        }}
        onLoad={() => setLoaded(true)}
      >
        {/* Loading state */}
        {!loaded && (
          <div
            slot="progress-bar"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ background: 'linear-gradient(135deg, #0a0b0f, #0f0f1e)' }}
          >
            {previewUrl && (
              // Dynamic R2 preview URL — next/image would need remotePatterns config
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="preview"
                className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm"
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#ffffff10" strokeWidth="4"/>
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none" stroke="#7c3aed" strokeWidth="4"
                    strokeDasharray={`${progress * 1.759} 175.9`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.3s ease' }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-medium">
                  {progress}%
                </span>
              </div>
              <p className="text-white/40 text-xs tracking-widest uppercase">Loading model</p>
            </div>
          </div>
        )}
      </model-viewer>

      {/* Bottom HUD bar */}
      <div 
        className="absolute bottom-0 left-0 right-0 px-4 py-2.5 flex items-center justify-between"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/40 text-xs">Drag to rotate · Scroll to zoom · Right-click to pan</span>
        </div>
        <a
          href={glbUrl}
          download
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
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
