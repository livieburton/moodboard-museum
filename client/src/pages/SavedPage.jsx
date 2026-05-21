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
      className={`saved-thumb${isActive ? ' saved-thumb--placeholder' : ''}`}
      {...attributes}
      {...listeners}
    >
      <img
        src={artwork.primary_image_small || artwork.primary_image}
        alt={artwork.title || 'Artwork'}
        className="saved-thumb__img"
      />
      <span className="saved-thumb__number">{number}</span>
      <button
        className="saved-thumb__remove"
        onClick={() => onRemove(artwork.object_id)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove ${artwork.title || 'artwork'}`}
      >
        ✕
      </button>
    </div>
  );
}

export default function SavedPage({ moodboard = [], onRemove, onReorder, panelTitle, onTitleChange }) {
  const [activeId, setActiveId] = useState(null);
  const [editValue, setEditValue] = useState(panelTitle || 'My Moodboard');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setEditValue(panelTitle || 'My Moodboard');
  }, [panelTitle]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  function commitTitle() {
    const saved = editValue.trim() || 'My Moodboard';
    setEditValue(saved);
    if (onTitleChange) onTitleChange(saved);
  }

  function handleDragStart({ active }) {
    setActiveId(active.id);
    if (typeof navigator.vibrate === 'function') navigator.vibrate(20);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = moodboard.findIndex((a) => a.object_id === active.id);
    const newIndex = moodboard.findIndex((a) => a.object_id === over.id);
    onReorder(arrayMove(moodboard, oldIndex, newIndex));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  async function generateBlob() {
    const CANVAS_W = 1200;
    const COLS = 3;
    const PAD = 40;
    const GAP = 10;
    const COL_W = Math.floor((CANVAS_W - PAD * 2 - GAP * (COLS - 1)) / COLS);

    try { await document.fonts.load('600 56px "Cormorant Garamond"'); } catch (e) {}

    const title = editValue || 'My Moodboard';

    const [loaded, logoImg] = await Promise.all([
      Promise.all(
        moodboard.map((artwork) =>
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
        img.src = '/logo2.svg';
      }),
    ]);

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
    const LOGO_W = 320;
    const logoH = logoImg ? Math.round((logoImg.naturalHeight / logoImg.naturalWidth) * LOGO_W) : 0;
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

    ctx.font = '600 56px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = '#1a1814';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, PAD, titleY, CANVAS_W - PAD * 2);

    ctx.strokeStyle = '#e8e4de';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, topDivY);
    ctx.lineTo(CANVAS_W - PAD, topDivY);
    ctx.stroke();

    for (const { img, x, y: iy, w, h } of placements) {
      ctx.drawImage(img, x, gridY + iy, w, h);
    }

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

    ctx.strokeStyle = '#e8e4de';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, botDivY);
    ctx.lineTo(CANVAS_W - PAD, botDivY);
    ctx.stroke();

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

    if (logoImg) {
      ctx.drawImage(logoImg, (CANVAS_W - LOGO_W) / 2, logoY, LOGO_W, logoH);
    }

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function triggerDownload(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moodboard.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveImage() {
    if (moodboard.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const blob = await generateBlob();
      const file = new File([blob], 'moodboard.png', { type: 'image/png' });
      // Use Web Share API (saves to camera roll on iOS/Android)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: editValue || 'My Moodboard' });
      } else {
        triggerDownload(blob);
      }
    } finally {
      setDownloading(false);
    }
  }

  async function downloadImage() {
    if (moodboard.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const blob = await generateBlob();
      triggerDownload(blob);
    } finally {
      setDownloading(false);
    }
  }

  const activeArtwork = moodboard.find((a) => a.object_id === activeId);
  const activeNumber = activeId ? moodboard.findIndex((a) => a.object_id === activeId) + 1 : null;
  const isEmpty = moodboard.length === 0;

  return (
    <main className="saved-page">
      <div className="saved-page__header">
        <span className="mm-smallcaps mm-smallcaps--accent mm-smallcaps--wide">My moodboard</span>
        <div className="saved-page__title-row">
          {isEmpty ? (
            <h1 className="saved-page__title">Saved.</h1>
          ) : (
            <>
              <input
                className="saved-page__title-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); }}
                placeholder="Name your moodboard…"
                aria-label="Moodboard title"
              />
              <span className="saved-page__count">{moodboard.length} pieces</span>
            </>
          )}
        </div>
        {!isEmpty && (
          <p className="saved-page__hint">Tap and hold to reorder.</p>
        )}
      </div>

      <div className={`saved-page__body${isEmpty ? ' saved-page__body--empty' : ''}`}>
        {isEmpty ? (
          <div className="saved-empty">
            <div className="saved-empty__glyph">○</div>
            <p className="saved-empty__text">Add images to your moodboard here.</p>
            <span className="mm-smallcaps saved-empty__hint">Tap ⊕ on any artwork →</span>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={moodboard.map((a) => a.object_id)}
              strategy={rectSortingStrategy}
            >
              <div className="saved-grid">
                {moodboard.map((artwork, i) => (
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
                <div className="saved-thumb saved-thumb--overlay">
                  <img
                    src={activeArtwork.primary_image_small || activeArtwork.primary_image}
                    alt={activeArtwork.title || 'Artwork'}
                    className="saved-thumb__img"
                  />
                  <span className="saved-thumb__number">{activeNumber}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {!isEmpty && (
        <div className="saved-page__footer">
          <button
            className="saved-download-btn"
            onClick={saveImage}
            disabled={downloading}
          >
            {downloading ? 'Preparing…' : 'Save Image'}
          </button>
        </div>
      )}
    </main>
  );
}
