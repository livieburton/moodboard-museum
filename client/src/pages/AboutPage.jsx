import { useState, useEffect } from 'react';

export default function AboutPage() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => setTotal(data.total))
      .catch(() => setTotal(null));
  }, []);

  const count = total !== null ? total.toLocaleString() : '…';
  const link = 'color:var(--accent);border-bottom:1px solid var(--accent);text-decoration:none';

  const sections = [
    {
      mark: 'I',
      title: 'What it is',
      body: 'Moodboard Museum is a search tool for CC0 art from the world\'s great museums, organized by aesthetic rather than period or medium. Search a mood — dark academia, cottagecore, girlboss — and find real, human-made artwork that fits the vibe.',
    },
    {
      mark: 'II',
      title: 'Why we built it',
      body: 'Why create more "AI slop" when there are thousands of real, human-made artworks at your fingertips? The world\'s museums have spent centuries collecting and preserving art and cultural artifacts, and much of it is freely available under CC0 licenses. Moodboard Museum makes that collection discoverable by aesthetic, so your next moodboard, mood reference, or creative project is more human.',
    },
    {
      mark: 'III',
      title: 'Who it\'s for',
      body: 'Designers, students, curators, artists, writers, museumgoers, gallery hoppers, creatives, creators, builders, historians, explorers, and curious humans.',
    },
    {
      mark: 'IV',
      title: 'How it works',
      body: `When you search an aesthetic, Moodboard Museum uses an LLM to translate your search into a set of structured filters — medium, period, subject tags — and queries a database of ${count} objects from open access collections. Results are ranked by relevance to the aesthetic. You can add images to a moodboard, rearrange them, and download the result as a PNG with full attribution. Because results are based on database tags, searches are imperfect (but that's part of what makes them interesting).<br><br>All images are Creative Commons Zero (CC0). Moodboard Museum includes attribution anyway because artists deserve credit, and because knowing who made something is part of understanding&nbsp;it.`,
    },
    {
      mark: 'V',
      title: 'Pardon our dust',
      body: 'I\'m working on expanding the archive with more collections and capabilities — stay tuned!',
    },
    {
      mark: 'VI',
      title: 'Get in touch',
      body: `If you'd like to suggest an addition or contribute to the project, say hello on <a href="https://github.com/livieburton/moodboard-museum" style="${link}">GitHub</a> or find me on <a href="https://www.linkedin.com/in/olivia-h-burton/" style="${link}">LinkedIn</a> (mention Moodboard Museum if we don't know each other yet!).`,
    },
  ];

  return (
    <main className="about-page">
      <div className="about-hero">
        <h1>About Moodboard Museum</h1>
        <p className="about-hero__byline">Curated by Olivia Burton</p>
      </div>

      <blockquote className="about-quote">
        AI shows you what the internet <em>thinks</em> cottagecore looks like.
        Moodboard Museum shows you where cottagecore <em>came from.</em>
      </blockquote>

      {sections.map(({ mark, title, body }) => (
        <div key={mark} className="about-section">
          <div className="about-section__head">
            <span className="mm-smallcaps mm-smallcaps--accent">§ {mark}</span>
            <h2>{title}</h2>
          </div>
          <p dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      ))}

      <div className="about-footer-rule">
        <span className="mm-smallcaps mm-smallcaps--wide">— End —</span>
      </div>
    </main>
  );
}
