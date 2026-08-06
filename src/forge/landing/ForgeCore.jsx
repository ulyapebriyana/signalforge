import { useEffect, useRef } from "react";

/**
 * The landing signature: a molten ingot suspended inside a bin lattice.
 * Its glow is not decorative — `heat` is driven by the live share of pools
 * currently sitting at Hot, so the object reads hotter when the market is.
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vPos = position;
    vNormal = normalMatrix * normal;
    float swell = fbm(position * 1.7 + vec3(0.0, uTime * 0.10, uTime * 0.05));
    float breathe = 0.5 + 0.5 * sin(uTime * 0.8);
    vec3 displaced = position + normal * (swell * 0.22 + breathe * 0.02 * uHeat);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vView = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.07;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Face normals from screen-space derivatives: the ingot reads as forged
    // facets rather than a smooth ball.
    vec3 faceNormal = normalize(cross(dFdx(vView), dFdy(vView)));
    vec3 viewDir = normalize(-vView);
    float key = max(dot(faceNormal, normalize(vec3(0.55, 0.75, 0.5))), 0.0);
    float fill = max(dot(faceNormal, normalize(vec3(-0.6, -0.2, 0.4))), 0.0);
    float fresnel = pow(1.0 - clamp(dot(faceNormal, viewDir), 0.0, 1.0), 3.0);

    // Ridged noise: the bright band sits on the n = 0.5 contour, so the heat
    // reads as thin seams running through the metal instead of blotches.
    float coarse = fbm(vPos * 2.4 + vec3(0.0, uTime * 0.05, 0.0));
    float fine = fbm(vPos * 5.6 + vec3(uTime * 0.03, 0.0, 0.0));
    float ridge = 1.0 - abs(coarse * 2.0 - 1.0);
    float hairline = 1.0 - abs(fine * 2.0 - 1.0);
    float seam = clamp(smoothstep(0.82, 0.99, ridge) + 0.4 * smoothstep(0.90, 1.0, hairline), 0.0, 1.0);
    float core = smoothstep(0.94, 1.0, ridge);

    vec3 ember = vec3(0.13, 0.68, 0.95);
    vec3 whiteHot = vec3(0.68, 0.93, 1.0);

    vec3 color = vec3(0.028, 0.036, 0.046);
    color += key * vec3(0.086, 0.108, 0.135);
    color += fill * vec3(0.030, 0.038, 0.048);
    color = mix(color, ember * 1.2, seam * (0.28 + uHeat * 0.72));
    color = mix(color, whiteHot, core * (0.3 + uHeat * 0.7));
    color += ember * fresnel * (0.2 + uHeat * 0.4);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SPARK_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aScale;
  varying float vFade;

  void main() {
    vec3 pos = position;
    float life = fract(aSeed + uTime * (0.045 + aSeed * 0.05));
    pos.y += life * 7.0 - 2.6;
    pos.x += sin((life + aSeed) * 6.2831) * 0.35;
    pos.z += cos((life + aSeed) * 5.1) * 0.3;
    vFade = (1.0 - life) * smoothstep(0.0, 0.12, life);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aScale * uPixelRatio * (26.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  varying float vFade;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vFade;
    vec3 color = mix(vec3(0.16, 0.70, 0.96), vec3(0.72, 0.94, 1.0), smoothstep(0.25, 0.0, d));
    gl_FragColor = vec4(color, alpha * 0.85);
  }
`;

export default function ForgeCore({ heat = 0.4, className = "" }) {
  const canvasRef = useRef(null);
  const heatRef = useRef(heat);
  heatRef.current = heat;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let THREE;
      try {
        THREE = await import("three");
      } catch {
        return; // The CSS ember backdrop stands in when WebGL assets fail to load.
      }
      if (disposed) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        return;
      }

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(0, 0, 10.5);

      const uniforms = {
        uTime: { value: 0 },
        uHeat: { value: heatRef.current },
      };

      const ingot = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5, 3),
        new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms }),
      );
      scene.add(ingot);

      // The lattice is a nod to DLMM liquidity bins: discrete shells around price.
      const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.55, 1)),
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16 }),
      );
      scene.add(cage);

      const outerCage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.5, 0)),
        new THREE.LineBasicMaterial({ color: 0x75879a, transparent: true, opacity: 0.1 }),
      );
      scene.add(outerCage);

      const sparkCount = reduceMotion ? 0 : 420;
      let sparks = null;
      if (sparkCount) {
        const positions = new Float32Array(sparkCount * 3);
        const seeds = new Float32Array(sparkCount);
        const scales = new Float32Array(sparkCount);
        for (let index = 0; index < sparkCount; index += 1) {
          const radius = 0.6 + Math.random() * 2.4;
          const angle = Math.random() * Math.PI * 2;
          positions[index * 3] = Math.cos(angle) * radius;
          positions[index * 3 + 1] = -1.8 + Math.random() * 0.6;
          positions[index * 3 + 2] = Math.sin(angle) * radius * 0.7;
          seeds[index] = Math.random();
          scales[index] = 0.4 + Math.random() * 1.5;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
        geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
        sparks = new THREE.Points(
          geometry,
          new THREE.ShaderMaterial({
            vertexShader: SPARK_VERTEX,
            fragmentShader: SPARK_FRAGMENT,
            uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        scene.add(sparks);
      }

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointerMove = (event) => {
        pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });

      const resize = () => {
        const { clientWidth, clientHeight } = canvas.parentElement || canvas;
        const width = Math.max(1, clientWidth);
        const height = Math.max(1, clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      if (canvas.parentElement) observer.observe(canvas.parentElement);

      let frame = 0;
      let running = true;
      const clock = new THREE.Clock();

      const render = () => {
        const elapsed = clock.getElapsedTime();
        uniforms.uTime.value = elapsed;
        uniforms.uHeat.value += (heatRef.current - uniforms.uHeat.value) * 0.02;
        if (sparks) sparks.material.uniforms.uTime.value = elapsed;

        pointer.x += (pointer.tx - pointer.x) * 0.045;
        pointer.y += (pointer.ty - pointer.y) * 0.045;

        ingot.rotation.y = elapsed * 0.12 + pointer.x * 0.3;
        ingot.rotation.x = Math.sin(elapsed * 0.18) * 0.12 + pointer.y * 0.18;
        cage.rotation.y = -elapsed * 0.06 + pointer.x * 0.16;
        cage.rotation.z = elapsed * 0.04;
        outerCage.rotation.y = elapsed * 0.03;
        outerCage.rotation.x = -elapsed * 0.02;
        camera.position.x = pointer.x * 0.45;
        camera.position.y = -pointer.y * 0.32;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
      };

      const loop = () => {
        if (!running) return;
        render();
        frame = requestAnimationFrame(loop);
      };

      if (reduceMotion) render();
      else frame = requestAnimationFrame(loop);

      // Pause the loop when the hero scrolls out of view or the tab is hidden.
      const visibility = () => {
        if (document.hidden) {
          running = false;
          cancelAnimationFrame(frame);
        } else if (!reduceMotion && !running) {
          running = true;
          frame = requestAnimationFrame(loop);
        }
      };
      document.addEventListener("visibilitychange", visibility);

      cleanup = () => {
        running = false;
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("visibilitychange", visibility);
        scene.traverse((object) => {
          object.geometry?.dispose?.();
          object.material?.dispose?.();
        });
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
