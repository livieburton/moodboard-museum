export default function MoodboardPanel({ artworks, onRemove, onClose, isOpen }) {
  async function downloadMoodboard() {
    if (artworks.length === 0) return;
    const COLS = 3;
    const CELL = 300;
    const rows = Math.ceil(artworks.length / COLS);
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL;
    canvas.height = rows * CELL;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f5f2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await Promise.all(
      artworks.map((artwork, i) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const scale = Math.max(CELL / img.width, CELL / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = col * CELL + (CELL - w) / 2;
            const y = row * CELL + (CELL - h) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(col * CELL, row * CELL, CELL, CELL);
            ctx.clip();
            ctx.drawImage(img, x, y, w, h);
            ctx.restore();
            resolve();
          };
          img.onerror = resolve;
          const src = artwork.primary_image_small || artwork.primary_image;
          img.src = `/api/image-proxy?url=${encodeURIComponent(src)}`;
        })
      )
    );

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'moodboard.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <>
      <div
        className={`moodboard-backdrop${isOpen ? ' open' : ''}`}
        onClick={onClose}
      />
      <aside className={`moodboard-panel${isOpen ? ' open' : ''}`}>
        <div className="moodboard-panel__header">
          <h2 className="moodboard-panel__title">
            My Moodboard
            {artworks.length > 0 && (
              <span className="moodboard-panel__count">{artworks.length}</span>
            )}
          </h2>
          <button
            className="moodboard-panel__close"
            onClick={onClose}
            aria-label="Close moodboard"
          >
            ✕
          </button>
        </div>

        <div className="moodboard-panel__body">
          {artworks.length === 0 ? (
            <p className="moodboard-panel__empty">
              No artworks yet — click Add on any result.
            </p>
          ) : (
            <div className="moodboard-grid">
              {artworks.map((artwork) => (
                <div key={artwork.object_id} className="moodboard-thumb">
                  <img
                    src={artwork.primary_image_small || artwork.primary_image}
                    alt={artwork.title || 'Artwork'}
                    className="moodboard-thumb__img"
                  />
                  <button
                    className="moodboard-thumb__remove"
                    onClick={() => onRemove(artwork.object_id)}
                    aria-label={`Remove ${artwork.title || 'artwork'}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {artworks.length > 0 && (
          <div className="moodboard-panel__footer">
            <button className="moodboard-download-btn" onClick={downloadMoodboard}>
              Download as image
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
