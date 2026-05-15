import { useState } from 'react';
import SearchView from './views/SearchView';

export default function App() {
  // 'search' | 'moodboard' — moodboard comes later
  const [view] = useState('search');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Moodboard Museum</h1>
        <p className="app-tagline">CC0 art from the Met, organized by aesthetic</p>
      </header>
      {view === 'search' && <SearchView />}
    </div>
  );
}
