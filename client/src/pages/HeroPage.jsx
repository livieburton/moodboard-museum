import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function HeroPage() {
  const [strips, setStrips] = useState([[], [], []]);
  const [loadedStrips, setLoadedStrips] = useState([false, false, false]);
  const loadCountsRef = useRef([0, 0, 0]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetch('/api/random?limit=60')
      .then((r) => r.json())
      .then((data) => {
        const artworks = (data.results || []).filter(
          (a) => a.primary_image_small || a.primary_image
        );
        if (artworks.length === 0) return;

        const groups = [[], [], []];
        artworks.forEach((a, i) => groups[i % 3].push(a));
        setStrips(groups.map((g) => [...g, ...g, ...g, ...g]));
      })
      .catch((err) => console.error('[HeroPage] fetch failed:', err));
  }, []);

  useEffect(() => {
    const hero   = document.querySelector('.hero');
    const mosaic = document.querySelector('.hero-mosaic');
    const els    = document.querySelectorAll('.hero-strip');
    console.log('[Hero heights]');
    console.log('  hero:   ', hero?.getBoundingClientRect().height);
    console.log('  mosaic: ', mosaic?.getBoundingClientRect().height);
    els.forEach((s, i) => console.log(`  strip ${i}: `, s.getBoundingClientRect().height));
  }, []);

  const handleImageLoad = (si) => {
    loadCountsRef.current[si]++;
    if (loadCountsRef.current[si] === 3) {
      setLoadedStrips((prev) => {
        const next = [...prev];
        next[si] = true;
        return next;
      });
    }
  };

  const speeds = ['55s', '75s', '95s'];
  const reverses = [false, true, false];

  return (
    <section className="hero">
      <div className="hero-mosaic" key={location.pathname}>
        {strips.map((images, si) => (
          <div
            key={si}
            className={`hero-strip${reverses[si] ? ' hero-strip--reverse' : ''}${loadedStrips[si] ? ' hero-strip--loaded' : ''}`}
          >
            <div
              className={`hero-strip__track${loadedStrips[si] ? ' hero-strip__track--animated' : ''}`}
              style={{ animationDuration: speeds[si] }}
            >
              {images.map((a, i) => (
                <img
                  key={i}
                  src={a.primary_image_small || a.primary_image}
                  alt=""
                  className="hero-strip__img"
                  loading="eager"
                  onLoad={() => handleImageLoad(si)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hero-overlay" />

      {/* Desktop: cream card overlay */}
      <div className="hero-content hero-content--desktop">
        <div className="hero-card">
          <img src="/logo1.svg" alt="Moodboard Museum" className="hero__logo" />
          <p style={{ whiteSpace: 'pre-line', fontSize: 22, lineHeight: 1.55,
                     fontFamily: 'var(--serif-body)', fontWeight: 500, color: 'var(--text)' }}>
            Every aesthetic has a visual history,{'\n'}and much of it is stored in museums.{'\n'}
            <em>Moodboard Museum</em> helps you find it.
          </p>
          <p style={{ marginTop: 14, fontSize: 19, fontStyle: 'italic',
                     fontFamily: 'var(--serif-body)', color: 'var(--text-secondary)' }}>
            Every image here was made by a human.
          </p>
          <button className="hero__cta-text" onClick={() => navigate('/explore')}>
            Enter the archive <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {/* Mobile: small logo card at top, editorial type lower on mosaic */}
      <div className="hero-content hero-content--mobile">
        <div className="hero-mobile-logo-card">
          <img src="/logo1.svg" alt="Moodboard Museum" className="hero-mobile-logo-img" />
        </div>
        <div className="hero-mobile-lower">
          <h1 className="hero-mobile-heading">Get inspired by something human.</h1>
          <p className="hero-mobile-sub">
            Every aesthetic has a visual history, and much of it is stored in museums.
          </p>
          <button className="hero-mobile-cta" onClick={() => navigate('/explore')}>
            Enter the archive <span aria-hidden style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: 16 }}>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
