import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext.jsx';
import { SIDE_COLORS } from '../../config/playbackConfig.js';

// Three.js dynamic import backdrop with audio/hype-reactive orbits, ribbons, and leader-colored cones
export default function ThreeBackdrop({ mode = 'idle' }) {
  const { reducedMotion, hype, leader, isGoldenHour, battle } = useAppContext();
  const mountRef = useRef(null);
  const rafRef = useRef(null);
  const teardownRef = useRef(() => {});

  useEffect(() => {
    if (reducedMotion) return;

    let disposed = false;

    async function init() {
      let THREE;
      try {
        THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      } catch {
        return;
      }
      if (disposed) return;

      const mount = mountRef.current;
      if (!mount) return;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      Object.assign(renderer.domElement.style, {
        position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none'
      });
      mount.appendChild(renderer.domElement);

      // Scene & camera
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 300);
      camera.position.set(0, 0, 24);

      // Lights
      const amb = new THREE.AmbientLight(0xffffff, 0.6);
      const key = new THREE.DirectionalLight(0xffffff, 1.0);
      key.position.set(8, 10, 10);
      scene.add(amb, key);

      // Background gradient plane (shader)
      const bgGeo = new THREE.PlaneGeometry(64, 36, 1, 1);
      const bgMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMode: { value: modeToUniform(mode) },
          uIntensity: { value: 0 },
          uGold: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uMode;
          uniform float uIntensity;
          uniform float uGold;
          // 0=idle,1=play,2=vote,3=finale
          vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d){
            return a + b*cos(6.28318*(c*t+d));
          }
          vec3 palette(float id, float t){
            if (id < 0.5) {
              return pal(t, vec3(0.22), vec3(0.25), vec3(1.0,0.5,0.0), vec3(0.0,0.33,0.67));
            } else if (id < 1.5) {
              return pal(t, vec3(0.15), vec3(0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.25,0.75));
            } else if (id < 2.5) {
              return pal(t, vec3(0.18), vec3(0.6), vec3(1.0,0.7,0.2), vec3(0.0,0.5,0.25));
            } else {
              return pal(t, vec3(0.2), vec3(0.7), vec3(0.0,0.6,0.4), vec3(0.2,0.1,0.0));
            }
          }
          void main(){
            float t = uTime*0.05;
            vec2 p = vUv*2.0 - 1.0;
            float r = length(p);
            float glow = smoothstep(1.0, 0.1, r);
            vec3 col = palette(uMode, t + r*0.3);
            // Add wave bands that pulse with intensity
            col += 0.12 * uIntensity * vec3(
              0.5+0.5*sin(5.0*(p.x+t)),
              0.5+0.5*cos(3.0*(p.y+t*1.2)),
              0.5+0.5*cos(6.0*(p.x-p.y+t*0.8))
            );
            // Golden tint overlay
            col = mix(col, col + vec3(0.35, 0.28, 0.0), clamp(uGold, 0.0, 1.0));
            col *= glow + 0.22;
            gl_FragColor = vec4(col, 0.92);
          }
        `,
        transparent: true,
        depthWrite: false
      });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      bg.position.set(0, 0, -12);
      scene.add(bg);

      // Volumetric light cones for sides (leader-colored)
      const coneGeo = new THREE.ConeGeometry(0.8, 12, 24, 1, true);
      const coneMatL = new THREE.MeshBasicMaterial({ color: SIDE_COLORS.a, transparent: true, opacity: 0.18, depthWrite: false });
      const coneMatR = new THREE.MeshBasicMaterial({ color: SIDE_COLORS.b, transparent: true, opacity: 0.18, depthWrite: false });
      const coneL = new THREE.Mesh(coneGeo, coneMatL);
      const coneR = new THREE.Mesh(coneGeo, coneMatR);
      coneL.position.set(-6, -3, -3); coneR.position.set(6, -3, -3);
      coneL.rotation.x = Math.PI; coneR.rotation.x = Math.PI;
      scene.add(coneL, coneR);

      // Orbits around sides (instanced spheres)
      const orbitCount = 600;
      const sphereGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const matA = new THREE.MeshBasicMaterial({ color: SIDE_COLORS.a, transparent: true, opacity: 0.9 });
      const matB = new THREE.MeshBasicMaterial({ color: SIDE_COLORS.b, transparent: true, opacity: 0.9 });
      const instA = new THREE.InstancedMesh(sphereGeo, matA, orbitCount);
      const instB = new THREE.InstancedMesh(sphereGeo, matB, orbitCount);
      scene.add(instA, instB);

      const dummy = new THREE.Object3D();
      const seedsA = new Array(orbitCount).fill(0).map(() => Math.random());
      const seedsB = new Array(orbitCount).fill(0).map(() => Math.random());

      function updateOrbits(time, intensity) {
        const baseR = 2.6 + 0.2 * Math.sin(time * 0.5);
        const baseZ = -1.2;
        for (let i = 0; i < orbitCount; i++) {
          const s = seedsA[i];
          const a = time * (0.5 + s) + s * 6.283;
          const r = baseR + 0.6 * Math.sin(time * 0.7 + s * 12.0);
          dummy.position.set(-6 + Math.cos(a) * r, 0.3 * Math.sin(a * 2.0 + s * 10.0), baseZ + 0.2 * Math.sin(a * 3.0));
          const sc = 0.6 + 0.9 * intensity * (0.5 + 0.5 * Math.sin(a * 4.0 + time * 3.0));
          dummy.scale.setScalar(sc * 0.6);
          dummy.updateMatrix();
          instA.setMatrixAt(i, dummy.matrix);
        }
        instA.instanceMatrix.needsUpdate = true;

        for (let i = 0; i < orbitCount; i++) {
          const s = seedsB[i];
          const a = -time * (0.55 + s) + s * 6.283;
          const r = baseR + 0.6 * Math.cos(time * 0.6 + s * 10.0);
          dummy.position.set(6 + Math.cos(a) * r, 0.3 * Math.sin(a * 2.0 + s * 9.0), baseZ + 0.2 * Math.sin(a * 2.6));
          const sc = 0.6 + 0.9 * intensity * (0.5 + 0.5 * Math.cos(a * 3.5 + time * 2.6));
          dummy.scale.setScalar(sc * 0.6);
          dummy.updateMatrix();
          instB.setMatrixAt(i, dummy.matrix);
        }
        instB.instanceMatrix.needsUpdate = true;
      }

      // Ribbon trails (two torus ribbons with hue shift on peaks)
      const ribbonGeo = new THREE.TorusKnotGeometry(2.4, 0.04, 120, 16);
      const ribbonMatA = new THREE.MeshBasicMaterial({ color: SIDE_COLORS.a, transparent: true, opacity: 0.4 });
      const ribbonMatB = new THREE.MeshBasicMaterial({ color: SIDE_COLORS.b, transparent: true, opacity: 0.4 });
      const ribbonA = new THREE.Mesh(ribbonGeo, ribbonMatA);
      const ribbonB = new THREE.Mesh(ribbonGeo.clone(), ribbonMatB.clone());
      ribbonA.position.set(-6, 0, -1); ribbonB.position.set(6, 0, -1);
      scene.add(ribbonA, ribbonB);

      // Resize
      const onResize = () => {
        if (!mount) return;
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);

      // Animate
      let t0 = performance.now();
      const animate = (now) => {
        const dt = now - t0;
        t0 = now;

        const intensity = computeIntensity(hype, battle?.stage, isGoldenHour);
        const t = now * 0.001;

        bgMat.uniforms.uTime.value += dt * 0.001;
        bgMat.uniforms.uMode.value = modeToUniform(mode);
        bgMat.uniforms.uIntensity.value = intensity;
        bgMat.uniforms.uGold.value = isGoldenHour ? 1.0 : 0.0;

        // Leader-colored cones: adjust opacity and color
        const isA = leader === 'a';
        const isB = leader === 'b';
        coneL.material.color.setHex(SIDE_COLORS.a);
        coneR.material.color.setHex(SIDE_COLORS.b);
        coneL.material.opacity = 0.14 + 0.22 * (isA ? 1 : 0) + 0.08 * intensity;
        coneR.material.opacity = 0.14 + 0.22 * (isB ? 1 : 0) + 0.08 * intensity;

        // Orbits
        updateOrbits(t, intensity);

        // Ribbons spin and hue pulse on intensity peaks
        const rotSpeed = 0.2 + 0.6 * intensity;
        ribbonA.rotation.y += rotSpeed * dt * 0.001;
        ribbonB.rotation.y -= rotSpeed * dt * 0.001;

        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);

      teardownRef.current = () => {
        try { cancelAnimationFrame(rafRef.current); } catch {}
        window.removeEventListener('resize', onResize);
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
            else obj.material.dispose?.();
          }
        });
        renderer.dispose();
        try { mount.removeChild(renderer.domElement); } catch {}
      };
    }

    init();
    return () => {
      disposed = true;
      try { teardownRef.current(); } catch {}
    };
  }, [reducedMotion, mode, hype, leader, isGoldenHour, battle?.stage]);

  return <div className="three-backdrop" ref={mountRef} aria-hidden="true" />;
}

function modeToUniform(mode) {
  switch (mode) {
    case 'play': return 1.0;
    case 'vote': return 2.0;
    case 'finale': return 3.0;
    default: return 0.0;
  }
}

function computeIntensity(hype, stage, golden) {
  const base =
    stage === 'winner' ? 0.9 :
    stage?.startsWith?.('vote') || stage === 'overtime' ? 0.7 :
    stage?.startsWith?.('r') ? 0.5 : 0.3;
  let val = base + hype * 0.8;
  if (golden) val += 0.3;
  return Math.max(0, Math.min(1.2, val));
}