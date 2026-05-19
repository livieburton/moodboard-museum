import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function AboutPage() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => setTotal(data.total))
      .catch(() => setTotal(null));
  }, []);

  const count = total !== null ? total.toLocaleString() : '…';

  return (
    <div className="about-page">
      <Link to="/explore" className="about-page__back">← Back to explore</Link>

      <h1 className="about-heading">About Moodboard Museum</h1>

      <section className="about-section">
        <h2 className="about-section__heading">What it is</h2>
        <p className="about-section__body">
          Moodboard Museum is a search tool for CC0 art from the world's great museums, organized by aesthetic rather than period or medium. Search an aesthetic (dark academia, cottagecore, girlboss…) and find real, human-made art that fits the vibe.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-section__heading">Why we built it</h2>
        <p className="about-section__body">
          Why create more "AI slop" when there are thousands of real, human-made artworks at your fingertips? The world's museums have spent centuries collecting and preserving human-made art, and much of it is now freely available under CC0 licenses. Moodboard Museum makes that collection discoverable by aesthetic, so your next moodboard, mood reference, or creative project is built from real art — not generated images.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-section__heading">Who it's for</h2>
        <p className="about-section__body">
          Designers, students, curators, artists, writers, museumgoers, gallery hoppers, creatives, creators, builders, historians, explorers, and curious people.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-section__heading">How it works</h2>
        <p className="about-section__body">
          When you search an aesthetic, Moodboard Museum uses AI to translate your search into a set of filters — medium, period, subject tags — and queries a database of <strong>{count}</strong> objects from open access collections. Results are ranked by relevance to the aesthetic. You can add images to a moodboard, rearrange them, and download the result as a PNG with full attribution. If you want to learn more about an image, you can click through to the museum's website. Because results are based on database tags, searches are imperfect — but that's part of what makes them interesting.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-section__heading">The images</h2>
        <p className="about-section__body">
          All images are Creative Commons Zero (CC0). We include attribution anyway because artists deserve credit, and because knowing who made something is part of understanding it.
        </p>
      </section>

      <section className="about-section">
        <h2 className="about-section__heading">Pardon our dust</h2>
        <p className="about-section__body">
          The Met is just the beginning. We're working on adding collections from the Art Institute of Chicago, the Rijksmuseum, the Smithsonian, and others. If you'd like to suggest a museum or contribute to the project, visit us on{' '}
          <a
            href="https://github.com/livieburton/moodboard-museum"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
