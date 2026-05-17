import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableThumb({ artwork, number, onRemove, isActive }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: artwork.object_id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`moodboard-thumb${isActive ? ' moodboard-thumb--placeholder' : ''}`}
      {...attributes}
      {...listeners}
    >
      <img
        src={artwork.primary_image_small || artwork.primary_image}
        alt={artwork.title || 'Artwork'}
        className="moodboard-thumb__img"
      />
      <span className="moodboard-thumb__number">{number}</span>
      <button
        className="moodboard-thumb__remove"
        onClick={() => onRemove(artwork.object_id)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove ${artwork.title || 'artwork'}`}
      >
        ✕
      </button>
    </div>
  );
}

function ExportPreview({ artworks, title }) {
  return (
    <div className="export-preview">
      <p className="export-preview__title">{title}</p>
      <div className="export-preview__divider" />
      <div className="export-preview__grid">
        {artworks.map((artwork, i) => (
          <div key={artwork.object_id} className="export-preview__thumb">
            <img
              src={artwork.primary_image_small || artwork.primary_image}
              alt={artwork.title || 'Artwork'}
            />
            <span className="export-preview__badge">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="export-preview__divider" />
      <ol className="export-preview__credits">
        {artworks.map((artwork, i) => {
          const parts = [artwork.artist_name, artwork.title || 'Untitled', 'The Met'].filter(Boolean);
          return (
            <li key={artwork.object_id}>
              <span>{i + 1}. </span>
              <em>{parts.join(' · ')}</em>
            </li>
          );
        })}
      </ol>
      <img src="/logo2.png" alt="Moodboard Museum" className="export-preview__logo" />
    </div>
  );
}

export default function MoodboardPanel({ artworks, onRemove, onReorder, onClose, isOpen, title, onTitleChange }) {
  const [activeId, setActiveId] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState(title);

  useEffect(() => {
    if (!isEditingTitle) setEditValue(title);
  }, [title]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  function commitTitle() {
    setIsEditingTitle(false);
    const saved = editValue.trim() || 'My Moodboard';
    setEditValue(saved);
    onTitleChange(saved);
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') commitTitle();
    if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setEditValue(title);
    }
  }

  function handleDragStart({ active }) {
    setActiveId(active.id);
    document.body.style.overflow = 'hidden';
    if (typeof navigator.vibrate === 'function') navigator.vibrate(20);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    document.body.style.overflow = '';
    if (!over || active.id === over.id) return;
    const oldIndex = artworks.findIndex((a) => a.object_id === active.id);
    const newIndex = artworks.findIndex((a) => a.object_id === over.id);
    onReorder(arrayMove(artworks, oldIndex, newIndex));
  }

  function handleDragCancel() {
    setActiveId(null);
    document.body.style.overflow = '';
  }

  async function generateMoodboardBlob() {
    const CANVAS_W = 1200;
    const COLS = 3;
    const PAD = 40;
    const GAP = 10;
    const COL_W = Math.floor((CANVAS_W - PAD * 2 - GAP * (COLS - 1)) / COLS);

    // Load Cormorant Garamond for title; fall back to Georgia if unavailable
    try { await document.fonts.load('600 56px "Cormorant Garamond"'); } catch (e) {}

    // Load artwork images and logo2 concurrently
    const [loaded, logoImg] = await Promise.all([
      Promise.all(
        artworks.map((artwork) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ img, artwork });
            img.onerror = () => resolve({ img: null, artwork });
            const src = artwork.primary_image_small || artwork.primary_image;
            img.src = `/api/image-proxy?url=${encodeURIComponent(src)}`;
          })
        )
      ),
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/logo2.png';
      }),
    ]);

    // Shortest-column masonry — natural aspect ratios, no cropping
    const colHeights = Array(COLS).fill(0);
    const placements = [];
    for (const { img, artwork } of loaded) {
      if (!img || !img.naturalWidth) continue;
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = PAD + col * (COL_W + GAP);
      const y = colHeights[col];
      const h = Math.round((img.naturalHeight / img.naturalWidth) * COL_W);
      placements.push({ img, artwork, x, y, w: COL_W, h });
      colHeights[col] += h + GAP;
    }

    const gridH = Math.max(...colHeights) - GAP;
    const LOGO_W = 200;
    const logoH = logoImg ? Math.round((logoImg.naturalHeight / logoImg.naturalWidth) * LOGO_W) : 0;

    // Dynamic layout — title → divider → grid → divider → credits → logo
    const TITLE_SIZE = 56;
    const CREDIT_LINE_H = 22;
    let y = PAD;
    const titleY = y; y += TITLE_SIZE + 16;
    const topDivY = y; y += 1 + 24;
    const gridY = y; y += gridH + 28;
    const botDivY = y; y += 1 + 22;
    const creditsY = y; y += placements.length * CREDIT_LINE_H + 28;
    const logoY = y; y += logoH + PAD;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = y;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f7f5f2';
    ctx.fillRect(0, 0, CANVAS_W, canvas.height);

    // Title
    ctx.font = '600 56px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = '#1a1814';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, PAD, titleY, CANVAS_W - PAD * 2);

    // Top divider
    ctx.strokeStyle = '#e8e4de';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, topDivY);
    ctx.lineTo(CANVAS_W - PAD, topDivY);
    ctx.stroke();

    // Images
    for (const { img, x, y: iy, w, h } of placements) {
      ctx.drawImage(img, x, gridY + iy, w, h);
    }

    // Number badges
    const BADGE_R = 11;
    placements.forEach(({ x, y: iy }, i) => {
      const bx = x + 8 + BADGE_R;
      const by = gridY + iy + 8 + BADGE_R;
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), bx, by);
      ctx.restore();
    });

    // Bottom divider
    ctx.strokeStyle = '#e8e4de';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, botDivY);
    ctx.lineTo(CANVAS_W - PAD, botDivY);
    ctx.stroke();

    // Credits
    placements.forEach(({ artwork }, i) => {
      const num = `${i + 1}.`;
      const parts = [artwork.artist_name, artwork.title || 'Untitled', 'The Met'].filter(Boolean);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '13px Georgia, serif';
      ctx.fillStyle = '#4a4540';
      const numW = ctx.measureText(num + ' ').width;
      ctx.fillText(num, PAD, creditsY + i * CREDIT_LINE_H);
      ctx.font = 'italic 13px Georgia, serif';
      ctx.fillText(parts.join(' · '), PAD + numW, creditsY + i * CREDIT_LINE_H);
    });

    // Logo
    if (logoImg) {
      ctx.drawImage(logoImg, (CANVAS_W - LOGO_W) / 2, logoY, LOGO_W, logoH);
    }

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  async function downloadMoodboard() {
    if (artworks.length === 0) return;
    const blob = await generateMoodboardBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moodboard.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareMoodboard() {
    if (artworks.length === 0) return;
    const blob = await generateMoodboardBlob();
    // Web Share API with file payload requires HTTPS — works on the deployed Railway
    // URL but not on localhost. canShare() returns false locally; falls back to download.
    const file = new File([blob], 'moodboard.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'moodboard.png';
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const canShare = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;
  const activeArtwork = artworks.find((a) => a.object_id === activeId);
  const activeNumber = activeId ? artworks.findIndex((a) => a.object_id === activeId) + 1 : null;

  return (
    <>
      <div className={`moodboard-backdrop${isOpen ? ' open' : ''}`} onClick={onClose} />
      <aside className={`moodboard-panel${isOpen ? ' open' : ''}`}>
        <div className="moodboard-panel__header">
          <h2 className="moodboard-panel__title">
            My Moodboard
            {artworks.length > 0 && (
              <span className="moodboard-panel__count">{artworks.length}</span>
            )}
          </h2>
          <button className="moodboard-panel__close" onClick={onClose} aria-label="Close moodboard">
            ✕
          </button>
        </div>

        <div className="moodboard-panel__body">
          {artworks.length === 0 ? (
            <p className="moodboard-panel__empty">
              No artworks yet — click Add on any result.
            </p>
          ) : (
            <>
              {isEditingTitle ? (
                <input
                  className="moodboard-title-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={handleTitleKeyDown}
                  autoFocus
                />
              ) : (
                <p
                  className="moodboard-title"
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to edit title"
                >
                  {title}
                </p>
              )}

              <div className="moodboard-view-toggle">
                <button
                  className={`moodboard-view-toggle__btn${viewMode === 'grid' ? ' active' : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid view
                </button>
                <button
                  className={`moodboard-view-toggle__btn${viewMode === 'preview' ? ' active' : ''}`}
                  onClick={() => setViewMode('preview')}
                >
                  Export preview
                </button>
              </div>

              {viewMode === 'preview' ? (
                <ExportPreview artworks={artworks} title={title} />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  <SortableContext
                    items={artworks.map((a) => a.object_id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="moodboard-grid">
                      {artworks.map((artwork, i) => (
                        <SortableThumb
                          key={artwork.object_id}
                          artwork={artwork}
                          number={i + 1}
                          onRemove={onRemove}
                          isActive={artwork.object_id === activeId}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeArtwork && (
                      <div className="moodboard-thumb moodboard-thumb--overlay">
                        <img
                          src={activeArtwork.primary_image_small || activeArtwork.primary_image}
                          alt={activeArtwork.title || 'Artwork'}
                          className="moodboard-thumb__img"
                        />
                        <span className="moodboard-thumb__number">{activeNumber}</span>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </>
          )}
        </div>

        {artworks.length > 0 && (
          <div className="moodboard-panel__footer">
            {canShare && (
              <button className="moodboard-download-btn" onClick={shareMoodboard}>
                Share
              </button>
            )}
            <button
              className={`moodboard-download-btn${canShare ? ' moodboard-download-btn--secondary' : ''}`}
              onClick={downloadMoodboard}
            >
              Download as image
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
