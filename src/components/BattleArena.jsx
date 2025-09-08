import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import * as THREE from 'three';
import gsap from 'gsap';

// Import the arena background so Vite processes the asset
import arenaBg from '../assets/arena-bg.jpg';

export default function BattleArena() {
  const mountRef = useRef(null);
  const { battle } = useAppContext();
  const threeRef = useRef({
    scene: null,
    renderer: null,
    camera: null,
    covers: { a: null, b: null },
    frame: 0
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#06070b', 0.035);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    camera.position.set(0, 1.2, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const spot = new THREE.SpotLight(0xff4fa8, 3, 15, Math.PI * 0.3, 0.4, 0.9);
    spot.position.set(0,5,3);
    scene.add(spot);

    const planeGeo = new THREE.PlaneGeometry(2.4, 2.4);
    const loader = new THREE.TextureLoader();
    const placeholderTex = loader.load(arenaBg);

    const matA = new THREE.MeshStandardMaterial({ map: placeholderTex, side:THREE.DoubleSide });
    const matB = new THREE.MeshStandardMaterial({ map: placeholderTex, side:THREE.DoubleSide });

    const coverA = new THREE.Mesh(planeGeo, matA);
    const coverB = new THREE.Mesh(planeGeo, matB);
    coverA.position.set(-1.6, 1.4, 0);
    coverB.position.set(1.6, 1.4, 0);
    coverA.rotation.y = Math.PI * 0.05;
    coverB.rotation.y = -Math.PI * 0.05;
    coverA.scale.set(0.001,0.001,0.001);
    coverB.scale.set(0.001,0.001,0.001);
    scene.add(coverA, coverB);

    const floorGeo = new THREE.CircleGeometry(6, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181d28,
      metalness:0.2,
      roughness:0.8,
      side:THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    scene.add(floor);

    threeRef.current = {
      scene, camera, renderer,
      covers: { a: coverA, b: coverB }
    };

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w,h);
      camera.aspect = w/h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      threeRef.current.frame = requestAnimationFrame(animate);
      coverA.rotation.y += 0.0015;
      coverB.rotation.y -= 0.0015;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(threeRef.current.frame);
      window.removeEventListener('resize', handleResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!battle || !threeRef.current.covers?.a) return;
    const { a, b, stage, winner } = battle;
    const loader = new THREE.TextureLoader();

    if (a?.album?.images?.[0]?.url) {
      loader.load(a.album.images[0].url, tex => {
        threeRef.current.covers.a.material.map = tex;
        threeRef.current.covers.a.material.needsUpdate = true;
      });
    }
    if (b?.album?.images?.[0]?.url) {
      loader.load(b.album.images[0].url, tex => {
        threeRef.current.covers.b.material.map = tex;
        threeRef.current.covers.b.material.needsUpdate = true;
      });
    }

    if (stage === 'intro') {
      gsap.fromTo(threeRef.current.covers.a.scale, {x:0.001,y:0.001,z:0.001}, {x:1,y:1,z:1, duration:0.9, ease:'back.out(1.6)'});
      gsap.fromTo(threeRef.current.covers.b.scale, {x:0.001,y:0.001,z:0.001}, {x:1,y:1,z:1, duration:0.9, ease:'back.out(1.6)'});
    }
    if (stage === 'finished' && winner) {
      const loser = winner === 'a' ? threeRef.current.covers.b : threeRef.current.covers.a;
      gsap.to(loser.scale, {x:0.001,y:0.001,z:0.001, duration:0.6, ease:'power2.in'});
      gsap.to(loser.material, {opacity:0, duration:0.6, ease:'power2.in'});
    }
  }, [battle]);

  return (
    <div className="three-container" ref={mountRef}>
      <div style={{
        position:'absolute',
        top:'5%',
        left:'50%',
        transform:'translateX(-50%)',
        fontSize:'clamp(2rem, 4vw, 3.5rem)',
        fontWeight:700,
        letterSpacing:'4px',
        background:'linear-gradient(90deg,#e91e63,#673ab7)',
        WebkitBackgroundClip:'text',
        color:'transparent',
        textShadow:'0 0 12px rgba(233,30,99,0.4)'
      }}>
        VS
      </div>
    </div>
  );
}