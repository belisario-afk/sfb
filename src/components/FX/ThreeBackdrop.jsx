import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext.jsx';

// Lightweight Three.js scene with CDN dynamic import and safe fallback.
export default function ThreeBackdrop({ mode = 'idle' }) {
  const { reducedMotion } = useAppContext();
  const mountRef = useRef(null);
  const rafRef = useRef(null);
  const teardownRef = useRef(() => {});

  useEffect(() => {
    if (reducedMotion) return; // respect user pref

    let disposed = false;

    async function init() {
      let THREE;
      try {
        THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      } catch {
        // Could not load; leave silently (App will still show other FX if any)
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
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.inset = '0';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.pointerEvents = 'none';
      mount.appendChild(renderer.domElement);

      // Scene & camera
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 200);
      camera.position.set(0, 0, 24);

      // Lights
      const amb = new THREE.AmbientLight(0xffffff, 0.6);
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(5, 10, 10);
      scene.add(amb, key);

      // Background gradient plane
      const bgGeo = new THREE.PlaneGeometry(60, 34, 1, 1);
      const bgMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMode: { value: modeToUniform(mode) }
        },
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uMode;
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
            col += 0.15*vec3(0.5+0.5*sin(4.0*(p.x+t)), 0.5+0.5*cos(3.0*(p.y+t*1.2)), 0.5+0.5*cos(5.0*(p.x-p.y+t)));
            col *= glow + 0.2;
            gl_FragColor = vec4(col, 0.9);
          }
        `,
        transparent: true,
        depthWrite: false
      });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      bg.position.set(0, 0, -10);
      scene.add(bg);

      // Particle stars
      const starGeo = new THREE.BufferGeometry();
      const starCount = 1200;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 2] = -5 - Math.random() * 10;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({
        size: 0.06,
        color: 0x9efcff,
        transparent: true,
        opacity: 0.85
      });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // Beams
      const beamGeo = new THREE.ConeGeometry(0.6, 10, 16, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x58c7ff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
      });
      const beamLeft = new THREE.Mesh(beamGeo, beamMat);
      const beamRight = new THREE.Mesh(beamGeo.clone(), beamMat.clone());
      beamLeft.position.set(-6, -3, -2);
      beamRight.position.set(6, -3, -2);
      beamLeft.rotation.x = Math.PI;
      beamRight.rotation.x = Math.PI;
      scene.add(beamLeft, beamRight);

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

        bgMat.uniforms.uTime.value += dt * 0.001;
        stars.rotation.z += dt * 0.00006;
        beamLeft.rotation.z += dt * 0.00025;
        beamRight.rotation.z -= dt * 0.00022;

        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);

      teardownRef.current = () => {
        try {
          cancelAnimationFrame(rafRef.current);
        } catch {}
        window.removeEventListener('resize', onResize);
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
            else obj.material.dispose?.();
          }
        });
        renderer.dispose();
        mount.removeChild(renderer.domElement);
      };
    }

    init();
    return () => {
      disposed = true;
      try { teardownRef.current(); } catch {}
    };
  }, [reducedMotion, mode]);

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