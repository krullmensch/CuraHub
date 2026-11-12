import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LEGAL_PAGES } from '@/lib/legal/legalApi';

interface LegalLinksProps {
  className?: string;
  /** Open in a new tab, so an open exhibition or editor keeps its state. */
  newTab?: boolean;
}

/** „Impressum · Datenschutz" — on every public page (§ 5 DDG: easy to find, always reachable). */
export const LegalLinks = ({ className, newTab = false }: LegalLinksProps) => {
  const target = newTab ? { target: '_blank', rel: 'noopener' } : {};
  return (
    <nav aria-label="Rechtliches" className={cn('flex items-center gap-3 text-xs', className)}>
      {Object.values(LEGAL_PAGES).map((page, i) => (
        <span key={page.path} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden="true" className="opacity-50">·</span>}
          <Link to={page.path} {...target} className="hover:text-white underline-offset-2 hover:underline transition-colors">
            {page.title}
          </Link>
        </span>
      ))}
    </nav>
  );
};
