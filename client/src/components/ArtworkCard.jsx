import { useState, useEffect, useRef } from 'react';

export default function ArtworkCard({ artwork, onAdd, isAdded }) {
  const { object_id, title, artist_name, museum, primary_image_small, primary_image, link_resource } = artwork;
  const imgSrc = primary_image_small || primary_image;
  const metUrl = link_resource || `https://www.metmuseum.org/art/collection/search/${object_id}`;
  const [hidden, setHidden] = useState(false);
  const [visible, setVisible] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (hidden) return null;

  return (
    <div ref={cardRef} className={`artwork-card${visible ? ' artwork-card--visible' : ''}`}>
      <a
        className="artwork-card__link"
        href={metUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${title || 'Artwork'} — opens Met museum page`}
      >
        {imgSrc ? (
          <img
            className="artwork-card__image"
            src={imgSrc}
            alt={title || 'Artwork'}
            loading="lazy"
            decoding="async"
            onError={() => setHidden(true)}
          />
        ) : (
          <div className="artwork-card__image--placeholder">
            Not yet available
          </div>
        )}
        <div className="artwork-card__body">
          <p className="artwork-card__title">{title || '(untitled)'}</p>
          {artist_name && <p className="artwork-card__artist">{artist_name}</p>}
          {museum && <p className="artwork-card__museum">{museum}</p>}
        </div>
      </a>
      {onAdd && (
        <button
          className={`artwork-card__add${isAdded ? ' added' : ''}`}
          onClick={() => !isAdded && onAdd(artwork)}
          aria-label={isAdded ? 'Added to moodboard' : 'Add to moodboard'}
        >
          {isAdded ? '✓ Added' : '+ Add'}
        </button>
      )}
    </div>
  );
}
