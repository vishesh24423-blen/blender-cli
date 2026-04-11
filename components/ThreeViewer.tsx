/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface ThreeViewerProps {
  glbUrl: string
  posterUrl?: string
  className?: string
}

// ── Dynamic CDN loader for Three.js + addons ──────────────────────
const THREE_VERSION = '0.164.1'
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`

let threeModulesPromise: Promise<Record<string, any>> | null = null

function loadThreeModules(): Promise<Record<string, any>> {
  if (threeModulesPromise) return threeModulesPromise

  threeModulesPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'importmap'
    script.textContent = JSON.stringify({
      imports: {
        three: `${CDN}/build/three.module.js`,
        'three/addons/': `${CDN}/examples/jsm/`,
      },
    })
    document.head.appendChild(script)

    // Load a bootstrap script that exposes modules on window
    const bootstrap = document.createElement('script')
    bootstrap.type = 'module'
    bootstrap.textContent = `
      import * as THREE from 'three';
      import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
      import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
      import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
      import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
      import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
      import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
      import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
      import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
      import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

      window.__THREE__ = THREE;
      window.__THREE_ADDONS__ = {
        OrbitControls, GLTFLoader, DRACOLoader, RGBELoader,
        EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, SMAAPass,
      };
      window.dispatchEvent(new CustomEvent('three-ready'));
    `
    document.head.appendChild(bootstrap)

    const timeout = setTimeout(() => reject(new Error('Three.js load timeout')), 30000)

    const onReady = () => {
      clearTimeout(timeout)
      window.removeEventListener('three-ready', onReady)
      resolve({
        THREE: (window as any).__THREE__,
        addons: (window as any).__THREE_ADDONS__,
      })
    }
    window.addEventListener('three-ready', onReady)
  })

  return threeModulesPromise
}

export default function ThreeViewer({ glbUrl, posterUrl, className = '' }: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || !glbUrl) return

    const container = containerRef.current
    let disposed = false

    const init = async () => {
      try {
        const { THREE, addons } = await loadThreeModules()
        if (disposed) return

        const {
          OrbitControls, GLTFLoader, DRACOLoader, RGBELoader,
          EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, SMAAPass,
        } = addons

        const w = container.clientWidth
        const h = container.clientHeight

        // ── Renderer ──────────────────────────────────────────────
        const renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
        })
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.4
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(w, h)
        container.insertBefore(renderer.domElement, container.firstChild)

        // ── Scene ─────────────────────────────────────────────────
        const scene = new THREE.Scene()
        scene.background = null

        // ── Camera ────────────────────────────────────────────────
        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
        camera.position.set(0, 2, 6)

        // ── Controls ──────────────────────────────────────────────
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.autoRotate = true
        controls.autoRotateSpeed = 1.5
        controls.minDistance = 2
        controls.maxDistance = 20
        controls.target.set(0, 1, 0)

        // ── Lighting ──────────────────────────────────────────────
        scene.add(new THREE.AmbientLight(0xffffff, 0.3))

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5)
        dirLight.position.set(5, 10, 5)
        dirLight.castShadow = true
        dirLight.shadow.mapSize.width = 2048
        dirLight.shadow.mapSize.height = 2048
        dirLight.shadow.camera.near = 0.5
        dirLight.shadow.camera.far = 50
        dirLight.shadow.camera.left = -10
        dirLight.shadow.camera.right = 10
        dirLight.shadow.camera.top = 10
        dirLight.shadow.camera.bottom = -10
        dirLight.shadow.bias = -0.0001
        scene.add(dirLight)

        // ── HDRI Environment ──────────────────────────────────────
        new RGBELoader().load(
          '/studio_small_03_1k.hdr',
          (texture: any) => {
            const pmrem = new THREE.PMREMGenerator(renderer)
            pmrem.compileEquirectangularShader()
            scene.environment = pmrem.fromEquirectangular(texture).texture
            texture.dispose()
            pmrem.dispose()
          },
          undefined,
          () => console.warn('HDRI failed to load, using default lighting')
        )

        // ── Post-Processing ───────────────────────────────────────
        const composer = new EffectComposer(renderer)
        composer.addPass(new RenderPass(scene, camera))

        composer.addPass(new UnrealBloomPass(
          new THREE.Vector2(w, h), 0.4, 0.8, 0.85
        ))

        composer.addPass(new ShaderPass({
          uniforms: { tDiffuse: { value: null }, dispersion: { value: 0.003 } },
          vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
          fragmentShader: `uniform sampler2D tDiffuse;uniform float dispersion;varying vec2 vUv;void main(){vec2 o=dispersion*(vUv-0.5);gl_FragColor=vec4(texture2D(tDiffuse,vUv+o).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-o).b,1.0);}`,
        }))

        composer.addPass(new ShaderPass({
          uniforms: { tDiffuse: { value: null }, offset: { value: 0.95 }, darkness: { value: 1.2 } },
          vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
          fragmentShader: `uniform sampler2D tDiffuse;uniform float offset;uniform float darkness;varying vec2 vUv;void main(){vec4 t=texture2D(tDiffuse,vUv);vec2 uv=(vUv-0.5)*offset;float v=clamp(1.0-dot(uv,uv)*darkness,0.0,1.0);gl_FragColor=vec4(t.rgb*v,t.a);}`,
        }))

        composer.addPass(new SMAAPass(w, h))

        // ── Load GLB ──────────────────────────────────────────────
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath(`${CDN}/examples/jsm/libs/draco/gltf/`)
        const gltfLoader = new GLTFLoader()
        gltfLoader.setDRACOLoader(dracoLoader)

        let originalCamPos: any = null

        gltfLoader.load(
          glbUrl,
          (gltf: any) => {
            if (disposed) return
            const model = gltf.scene
            model.traverse((child: any) => {
              if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
            })
            scene.add(model)

            const box = new THREE.Box3().setFromObject(model)
            const size = box.getSize(new THREE.Vector3())
            const center = box.getCenter(new THREE.Vector3())
            const maxDim = Math.max(size.x, size.y, size.z)
            const fov = camera.fov * (Math.PI / 180)
            const camZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2

            originalCamPos = new THREE.Vector3(center.x, center.y + camZ * 0.35, center.z + camZ)
            camera.position.copy(originalCamPos)
            controls.target.copy(center)
            controls.update()

            setIsLoading(false)
          },
          undefined,
          () => { setHasError(true); setIsLoading(false) }
        )

        // ── Mouse Parallax ────────────────────────────────────────
        const mouse = { x: 0, y: 0 }
        const onMouseMove = (e: MouseEvent) => {
          const rect = container.getBoundingClientRect()
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        }
        container.addEventListener('mousemove', onMouseMove)

        // ── Animate ───────────────────────────────────────────────
        let animId = 0
        const animate = () => {
          if (disposed) return
          if (originalCamPos) {
            camera.position.x = originalCamPos.x + mouse.x * 0.02
            camera.position.y = originalCamPos.y + mouse.y * 0.01
          }
          controls.update()
          composer.render()
          animId = requestAnimationFrame(animate)
        }
        animate()

        // ── Resize ────────────────────────────────────────────────
        const onResize = () => {
          if (disposed) return
          const nw = container.clientWidth
          const nh = container.clientHeight
          camera.aspect = nw / nh
          camera.updateProjectionMatrix()
          renderer.setSize(nw, nh)
          composer.setSize(nw, nh)
        }
        window.addEventListener('resize', onResize)

        // ── Cleanup ───────────────────────────────────────────────
        cleanupRef.current = () => {
          disposed = true
          cancelAnimationFrame(animId)
          container.removeEventListener('mousemove', onMouseMove)
          window.removeEventListener('resize', onResize)
          controls.dispose()
          composer.dispose()
          renderer.dispose()
          if (renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement)
          }
        }
      } catch (err) {
        console.error('ThreeViewer init error:', err)
        setHasError(true)
        setIsLoading(false)
      }
    }

    init()
    return () => cleanup()
  }, [glbUrl, cleanup])

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] ${className}`}
      style={{ minHeight: '500px' }}
    >
      {posterUrl && isLoading && !hasError && (
        <img src={posterUrl} alt="3D model preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
      )}

      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f0f1a]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white/60">Loading 3D model…</span>
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f0f1a]/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm text-white/60 max-w-xs">Failed to load 3D model. Try downloading the file below.</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-black/40 backdrop-blur-sm flex items-center justify-between pointer-events-none">
        <span className="text-xs text-white/40">Drag to rotate · Scroll to zoom</span>
        <a href={glbUrl} download className="text-xs text-purple-400 hover:text-purple-300 transition-colors pointer-events-auto">
          Download GLB ↓
        </a>
      </div>
    </div>
  )
}
