import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function ExploreBanner({ moodboard = [], onOpenMoodboard }) {
  const [images, setImages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const loadCountRef = useRef(0);

  useEffect(() => {
    fetch('/api/random?limit=40')
      .then((r) => r.json())
      .then((data) => {
        const artworks = (data.results || []).filter(
          (a) => a.primary_image_small || a.primary_image
        );
        if (artworks.length === 0) return;
        setImages([...artworks, ...artworks, ...artworks, ...artworks]);
      })
      .catch((err) => console.error('[ExploreBanner] fetch failed:', err));
  }, []);

  function handleImageLoad() {
    loadCountRef.current += 1;
    if (loadCountRef.current === 4) setLoaded(true);
  }

  return (
    <div className="explore-banner">
      <div className={`explore-banner__strip${loaded ? ' explore-banner__strip--animated' : ''}`}>
        {images.map((a, i) => (
          <img
            key={i}
            src={a.primary_image_small || a.primary_image}
            alt=""
            className="explore-banner__img"
            loading="eager"
            onLoad={handleImageLoad}
          />
        ))}
      </div>
      <div className="explore-banner__overlay" />
      <div className="explore-banner__row">
        <Link to="/" className="explore-banner__brand">
          <img src="/logo1.svg" alt="Moodboard Museum" />
        </Link>
        <Link to="/about" className="explore-banner__about">About</Link>
      </div>
    </div>
  );
}
