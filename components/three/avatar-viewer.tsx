"use client";

/**
 * The 3D viewer.
 *
 * One component serves both the editor and the landing hero, because the most
 * honest thing a landing page for a 3D tool can show is the tool's own
 * viewport. It is framed like one too: a grid floor, an axis gizmo in the
 * corner using the conventional X red, Y green, Z blue, and a live readout of
 * vertices, triangles and bones.
 *
 * The reveal is deliberate. The model draws in as a wireframe and then resolves
 * into skin, which is the logo's idea in motion: a photo becoming a model. It
 * is the page's one orchestrated moment, and it is skipped entirely under
 * reduced motion rather than merely shortened.
 */

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, GizmoHelper, GizmoViewport, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { prepareModel, type ViewerStats } from "@/lib/three/prepare-model";
import { cn } from "@/lib/utils";

/*
  Scene preparation lives in lib/three so it can be tested in Node. It is pure
  scene-graph work with no WebGL, and the first version of it recursed until the
  stack ran out; nothing that only renders in a browser would have caught that.
*/
export type { ViewerStats };

interface ModelProps {
  url: string;
  reveal: boolean;
  onStats: (stats: ViewerStats) => void;
  onError: (message: string) => void;
}

function Model({ url, reveal, onStats, onError }: ModelProps) {
  const gltf = useGLTF(url);

  const { scene, wireMaterials, skinMaterials, stats, error } = React.useMemo(
    () => prepareModel(gltf.scene, reveal),
    [gltf.scene, reveal],
  );

  const progress = React.useRef(reveal ? 0 : 1);

  React.useEffect(() => {
    if (error) onError(error);
    else onStats(stats);
  }, [error, stats, onError, onStats]);

  useFrame((_, delta) => {
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta * 0.55);

    // The wireframe peaks early then gives way; skin comes up behind it.
    const wireOpacity = Math.sin(progress.current * Math.PI) * 0.9;
    const skinOpacity = Math.max(0, (progress.current - 0.35) / 0.65);

    for (const material of wireMaterials) {
      material.opacity = wireOpacity;
    }
    for (const material of skinMaterials) {
      material.opacity = skinOpacity;
      // Turn transparency back off once opaque: leaving it on costs a sorting
      // pass every frame and can make the model z-fight against itself.
      if (skinOpacity >= 1) material.transparent = false;
    }
  });

  if (!scene) return null;
  return <primitive object={scene} />;
}

/** Frames the camera on the model once it has loaded. */
function FrameCamera({ height }: { height: number }) {
  const { camera } = useThree();

  React.useEffect(() => {
    const distance = height * 1.55;
    camera.position.set(distance * 0.42, height * 0.62, distance);
    camera.lookAt(0, height * 0.48, 0);
  }, [camera, height]);

  return null;
}

export interface AvatarViewerProps {
  /** URL of the GLB to display. */
  src: string;
  className?: string;
  /** Play the wireframe-to-skin reveal on mount. */
  reveal?: boolean;
  /** Turn slowly on its own. Used on the landing hero, not in the editor. */
  autoRotate?: boolean;
  /** Show the grid, gizmo and statistics overlay. */
  chrome?: boolean;
  /** Roughly how tall the avatar is, in metres, for framing. */
  height?: number;
}

export function AvatarViewer({
  src,
  className,
  reveal = false,
  autoRotate = false,
  chrome = true,
  height = 1.75,
}: AvatarViewerProps) {
  const [stats, setStats] = React.useState<ViewerStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const prefersReducedMotion = React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const handleStats = React.useCallback((next: ViewerStats) => setStats(next), []);
  const handleError = React.useCallback((message: string) => setError(message), []);

  if (error) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-[4px] border border-bad/40 bg-bad/[0.06] p-6 text-center",
          className,
        )}
      >
        <div className="space-y-1">
          <p className="text-sm text-bad">This model could not be displayed.</p>
          <p className="text-[0.8125rem] text-mute">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[4px] bg-void", className)}>
      <Canvas
        camera={{ fov: 34, near: 0.05, far: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        // A viewport is not a document; keep it out of the tab order until the
        // user actually wants to orbit it.
        tabIndex={-1}
      >
        <color attach="background" args={["#0a0c11"]} />
        <hemisphereLight intensity={0.55} groundColor="#0a0c11" color="#c9d2ff" />
        <directionalLight position={[3, 5, 4]} intensity={1.5} castShadow={false} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#c063ff" />

        <React.Suspense fallback={null}>
          <Model
            url={src}
            reveal={reveal && !prefersReducedMotion}
            onStats={handleStats}
            onError={handleError}
          />
          <Environment preset="studio" environmentIntensity={0.35} />
        </React.Suspense>

        <FrameCamera height={height} />

        {chrome && (
          <>
            <Grid
              args={[12, 12]}
              cellSize={0.25}
              cellThickness={0.5}
              cellColor="#232838"
              sectionSize={1}
              sectionThickness={1}
              sectionColor="#333a4f"
              fadeDistance={9}
              fadeStrength={1.4}
              infiniteGrid
              position={[0, 0, 0]}
            />
            <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
              <GizmoViewport
                axisColors={["#ff5c6c", "#5ce08a", "#5c9bff"]}
                labelColor="#0a0c11"
              />
            </GizmoHelper>
          </>
        )}

        <OrbitControls
          makeDefault
          enablePan={false}
          autoRotate={autoRotate && !prefersReducedMotion}
          autoRotateSpeed={0.55}
          minDistance={height * 0.55}
          maxDistance={height * 3.2}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI / 1.8}
          target={[0, height * 0.48, 0]}
        />
      </Canvas>

      {chrome && stats && (
        <dl className="pointer-events-none absolute left-3 top-3 space-y-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-faint">
          <div className="flex gap-2">
            <dt>verts</dt>
            <dd className="tabular-nums text-mute">{stats.vertices.toLocaleString()}</dd>
          </div>
          <div className="flex gap-2">
            <dt>tris</dt>
            <dd className="tabular-nums text-mute">{stats.triangles.toLocaleString()}</dd>
          </div>
          <div className="flex gap-2">
            <dt>bones</dt>
            <dd className="tabular-nums text-mute">{stats.bones}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Warms the loader cache so opening the editor does not stall on the model. */
export function preloadAvatar(url: string): void {
  useGLTF.preload(url);
}
