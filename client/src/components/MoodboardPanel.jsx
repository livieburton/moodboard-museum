import { useState } from 'react';
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
    touchAction: 'none', // prevents scroll interference during drag
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

export default function MoodboardPanel({ artworks, onRemove, onReorder, onClose, isOpen }) {
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

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
    const PAD = 28;
    const GAP = 10;
    const COL_W = Math.floor((CANVAS_W - PAD * 2 - GAP * (COLS - 1)) / COLS);

    // Load all images concurrently
    const loaded = await Promise.all(
      artworks.map((artwork) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ img, artwork });
          img.onerror = () => resolve({ img: null, artwork });
          const src = artwork.primary_image_small || artwork.primary_image;
          img.src = `/api/image-proxy?url=${encodeURIComponent(src)}`;
        })
      )
    );

    // Shortest-column masonry — natural aspect ratios, no cropping
    const colHeights = Array(COLS).fill(PAD);
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

    const gridBottom = Math.max(...colHeights) - GAP;

    // Credits block geometry
    const DIVIDER_Y = gridBottom + 28;
    const CREDIT_TOP = DIVIDER_Y + 22;
    const CREDIT_LINE_H = 20;
    const FOOTER_Y = CREDIT_TOP + placements.length * CREDIT_LINE_H + 18;
    const CANVAS_H = FOOTER_Y + 28;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#f7f5f2';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Images — no cropping, natural aspect ratio
    for (const { img, x, y, w, h } of placements) {
      ctx.drawImage(img, x, y, w, h);
    }

    // Number badges on each image
    const BADGE_R = 11;
    placements.forEach(({ x, y }, i) => {
      const bx = x + 8 + BADGE_R;
      const by = y + 8 + BADGE_R;
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

    // Divider line
    ctx.strokeStyle = '#e8e4de';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, DIVIDER_Y);
    ctx.lineTo(CANVAS_W - PAD, DIVIDER_Y);
    ctx.stroke();

    // Credits — numbered, italic serif
    placements.forEach(({ artwork }, i) => {
      const num = `${i + 1}.`;
      const parts = [artwork.artist_name, artwork.title || 'Untitled', 'The Met'].filter(Boolean);

      ctx.font = '13px Georgia, serif';
      ctx.fillStyle = '#4a4540';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const numW = ctx.measureText(num + ' ').width;
      ctx.fillText(num, PAD, CREDIT_TOP + i * CREDIT_LINE_H);

      ctx.font = 'italic 13px Georgia, serif';
      ctx.fillText(parts.join(' · '), PAD + numW, CREDIT_TOP + i * CREDIT_LINE_H);
    });

    // Footer
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#7a7470';
    ctx.fillText('Created with Moodboard Museum', PAD, FOOTER_Y);

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
    // URL but not on localhost. canShare() will return false locally; falls back to download.
    const file = new File([blob], 'moodboard.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My Moodboard' });
    } else {
      // Fallback: explicit .png filename so iOS recognises it as an image in Save to Files
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
