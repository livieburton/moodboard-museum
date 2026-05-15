import { useState } from 'react';

export default function ArtworkCard({ artwork, onAdd, isAdded }) {
  const { title, artist_name, primary_image_small, primary_image, link_resource } = artwork;
  const imgSrc = primary_image_small || primary_image;
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div className="artwork-card">
      <a
        className="artwork-card__link"
        href={link_resource}
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
      </a>
      <div className="artwork-card__body">
        <p className="artwork-card__title">{title || '(untitled)'}</p>
        {artist_name && <p className="artwork-card__artist">{artist_name}</p>}
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
    </div>
  );
}
