import React from 'react';
import { buildStorefrontPath, type StorefrontRoute, useStorefrontRoute } from './StorefrontRouter';

interface StorefrontLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: StorefrontRoute | string;
  replace?: boolean;
}

export const StorefrontLink: React.FC<StorefrontLinkProps> = ({ to, replace = false, onClick, children, ...props }) => {
  const { navigate } = useStorefrontRoute();
  const href = typeof to === 'string' ? to : buildStorefrontPath(to);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(url.pathname + url.search, replace);
  };

  return (
    <a {...props} href={href} onClick={handleClick}>
      {children}
    </a>
  );
};
