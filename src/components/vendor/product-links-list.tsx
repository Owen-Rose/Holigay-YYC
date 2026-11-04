import type { ReactNode } from 'react';

/**
 * A vendor's product links as clickable links, in stored order, each opening in
 * a new tab (spec 011 FR-013). Renders nothing for an empty list; the caller
 * decides what an absent value looks like.
 */
export function ProductLinksList({ links }: { links: readonly string[] }): ReactNode {
  if (links.length === 0) return null;

  return (
    <ol className="space-y-1">
      {/* Index in the key: nothing stops a vendor entering the same link twice */}
      {links.map((link, index) => (
        <li key={`${index}:${link}`}>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover break-all"
          >
            {link}
          </a>
        </li>
      ))}
    </ol>
  );
}
