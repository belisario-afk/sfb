import React, { useEffect, useRef } from 'react';

// Lightweight canvas fallback particles (used when reducedMotion is true or Three fails)
export default function ParticleField() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const fit = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const onResize = () => fit();
    fit(); window.addEventListener('resize', onResize);

    const COUNT = 80;
    if (!particlesRef.current.length) {
      for (let i = 0; i < COUNT; i++) particlesRef.current.push(spawn(canvas));
    }

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(40, now - last);
      last = now;

      ctx.clearRect(0, 0, canvas.width / DPR, canvas.height / DPR);
      for (const p of particlesRef.current) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt;
        if (p.l <= 0 || p.x < -50 || p.y < -50 || p.x > canvas.width + 50 || p.y > canvas.height + 50) {
          Object.assign(p, spawn(canvas));
        }
        draw(ctx, p);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas className="three-backdrop" ref={canvasRef} aria-hidden="true" />;
}

function spawn(canvas) {
  const speed = 0.02 + Math.random() * 0.08;
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 1 + Math.random() * 2.8,
    c: Math.random() < 0.33 ? '#58c7ff' : (Math.random() < 0.5 ? '#4ade80' : '#ff6bd5'),
    l: 4000 + Math.random() * 6000
  };
}
function draw(ctx, p) {
  ctx.beginPath();
  ctx.fillStyle = p.c;
  ctx.globalAlpha = 0.6;
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}