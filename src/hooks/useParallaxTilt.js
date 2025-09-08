import { useEffect, useRef } from 'react';
import { PARALLAX_MAX_TILT_DEG, PARALLAX_TRANSITION_MS } from '../config/uiConfig.js';

export default function useParallaxTilt(ref, enabled = true) {
  const frameRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let rect = el.getBoundingClientRect();
    const handleMove = (e) => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const rx = (y - 0.5) * PARALLAX_MAX_TILT_DEG;
        const ry = (0.5 - x) * PARALLAX_MAX_TILT_DEG;
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
    };
    const handleLeave = () => {
      el.style.transition = `transform ${PARALLAX_TRANSITION_MS}ms cubic-bezier(.25,.8,.25,1)`;
      el.style.transform = `perspective(900px) rotateX(0deg) rotateY(0deg)`;
      setTimeout(()=> { el.style.transition = ''; }, PARALLAX_TRANSITION_MS+10);
    };
    const handleResize = () => { rect = el.getBoundingClientRect(); };

    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerleave', handleLeave);
    window.addEventListener('resize', handleResize);

    return () => {
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerleave', handleLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, [ref, enabled]);
}