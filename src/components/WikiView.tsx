import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';

import wikiPages from '../wiki/pages.json';

// Order and titles come from src/wiki/pages.json (shared with the project website in site/).
const docs = import.meta.glob<string>('../wiki/*.md', { query: '?raw', import: 'default', eager: true });

interface WikiPage {
  id: string;
  title: string;
  content: string;
}

const pages: WikiPage[] = wikiPages.map(({ id, title }) => ({
  id,
  title,
  content: docs[`../wiki/${id}.md`] ?? '',
}));

export const WikiView = () => {
  const [activePageId, setActivePageId] = useState(pages[0].id);
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-56 shrink-0 bg-zinc-900/80 border-r border-zinc-700/60 flex flex-col py-5 px-3 gap-1">
        <div className="flex items-center gap-2 px-3 mb-4 text-zinc-400">
          <BookOpen className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Benutzerhandbuch</span>
        </div>
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => setActivePageId(page.id)}
            className={`text-left text-sm px-3 py-2 rounded-lg transition-colors ${
              page.id === activePageId
                ? 'bg-blue-600/20 text-blue-400 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {page.title}
          </button>
        ))}
      </nav>

      {/* Content */}
      <article className="flex-1 overflow-y-auto p-8 bg-zinc-950">
        <div className="max-w-3xl mx-auto wiki-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {activePage.content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
};
