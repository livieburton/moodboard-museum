import { useState, useEffect, useRef } from 'react';

export default function ArtworkCard({ artwork, onAdd, isAdded }) {
  const { object_id, title, artist_name, year, primary_image_small, primary_image, link_resource } = artwork;
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
    <div className={`artwork-card${visible ? ' artwork-card--visible' : ''}`} ref={cardRef}>
      <a className="artwork-card__link" href={metUrl} target="_blank" rel="noopener noreferrer">
        <div className="artwork-card__plate">
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
        </div>
      </a>
      <div className="artwork-card__rule" aria-hidden="true" />
      <div className="artwork-card__body">
        <p className="artwork-card__title">{title || '(untitled)'}</p>
        <span className="mm-smallcaps artwork-card__meta">
          {artist_name}{year ? ` · ${year}` : ''}
        </span>
        <div className="artwork-card__footer">
          <span className="mm-smallcaps">The Met</span>
          {onAdd && (
            <button
              className={`artwork-card__add${isAdded ? ' added' : ''}`}
              onClick={() => !isAdded && onAdd(artwork)}
              disabled={isAdded}
              aria-label={isAdded ? 'Added' : 'Add to moodboard'}
            >
              {isAdded ? '✓ Added' : '+ Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
