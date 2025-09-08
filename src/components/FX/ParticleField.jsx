import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext.jsx';
import {
  FX_PARTICLE_COUNT,
  FX_PARTICLE_BASE_SPEED,
  FX_COLOR_PLAY,
  FX_COLOR_VOTE,
  FX_COLOR_FINISH
} from '../../config/uiConfig.js';

function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

export default function ParticleField() {
  const { battle, visualFxEnabled, reducedMotion } = useAppContext();
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    if (!visualFxEnabled || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let w = canvas.width = canvas.offsetWidth * devicePixelRatio;
    let h = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const handleResize = () => {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    window.addEventListener('resize', handleResize);

    const colors = () => {
      if (!battle) return FX_COLOR_PLAY;
      if (battle.stage.startsWith('vote')) return FX_COLOR_VOTE;
      if (battle.stage === 'finished') return FX_COLOR_FINISH;
      return FX_COLOR_PLAY;
    };

    // init particles
    if (!particlesRef.current.length) {
      for (let i=0;i<FX_PARTICLE_COUNT;i++) {
        particlesRef.current.push(spawn(w,h, colors()));
      }
    }

    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      last = now;
      ctx.clearRect(0,0,w/devicePixelRatio,h/devicePixelRatio);

      const colSet = colors();
      particlesRef.current.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <=0 || p.x < -50 || p.x > w+50 || p.y < -50 || p.y > h+50) {
          Object.assign(p, spawn(w,h, colSet));
        }
        drawParticle(ctx, p);
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [battle, visualFxEnabled, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="fx-particles"
      aria-hidden="true"
    />
  );
}

function spawn(w, h, palette) {
  const angle = Math.random() * Math.PI * 2;
  const speed = (FX_PARTICLE_BASE_SPEED + Math.random() * FX_PARTICLE_BASE_SPEED) * (0.4 + Math.random()*1.2);
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 1 + Math.random() * 3.5,
    life: 4000 + Math.random() * 6000,
    color: pick(palette),
    glow: Math.random() * 0.6 + 0.2
  };
}

function drawParticle(ctx, p) {
  ctx.beginPath();
  ctx.fillStyle = p.color;
  ctx.globalAlpha = p.glow;
  ctx.arc(p.x/ devicePixelRatio, p.y/ devicePixelRatio, p.r, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}