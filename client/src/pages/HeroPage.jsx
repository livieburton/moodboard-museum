import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HeroPage() {
  const [strips, setStrips] = useState([[], [], []]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/random?limit=60')
      .then((r) => {
        console.log('[HeroPage] /api/random status:', r.status);
        return r.json();
      })
      .then((data) => {
        console.log('[HeroPage] raw response:', JSON.stringify(data).slice(0, 300));
        const artworks = (data.results || []).filter(
          (a) => a.primary_image_small || a.primary_image
        );
        console.log('[HeroPage] images with URLs:', artworks.length);
        if (artworks.length === 0) return;

        // Distribute evenly across 3 strips — works even with < 60 results
        const groups = [[], [], []];
        artworks.forEach((a, i) => groups[i % 3].push(a));

        // Duplicate each group so the CSS translateX(-50%) loop is seamless
        setStrips(groups.map((g) => [...g, ...g]));
      })
      .catch((err) => console.error('[HeroPage] fetch failed:', err));
  }, []);

  const speeds = ['30s', '42s', '55s'];
  const reverses = [false, true, false];

  return (
    <section className="hero">
      <div className="hero-mosaic">
        {strips.map((images, si) => (
          <div
            key={si}
            className={`hero-strip${reverses[si] ? ' hero-strip--reverse' : ''}`}
          >
            <div
              className="hero-strip__track"
              style={{ animationDuration: speeds[si] }}
            >
              {images.map((a, i) => (
                <img
                  key={i}
                  src={a.primary_image_small || a.primary_image}
                  alt=""
                  className="hero-strip__img"
                  loading="eager"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hero-overlay" />

      <div className="hero-content">
        <img src="/logo1.png" alt="Moodboard Museum" className="hero__logo" />
        <p className="hero__intro">
          Every aesthetic has a visual history, and much of it is hanging in museums. Moodboard Museum helps you find it.
        </p>
        <p className="hero__intro">
          Every image here was made by a human.
        </p>
        <button className="hero__cta" onClick={() => navigate('/explore')}>
          Start exploring →
        </button>
      </div>
    </section>
  );
}
