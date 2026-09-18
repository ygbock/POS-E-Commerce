
import React from 'react';
import { DiscoveryHome } from './DiscoveryHome';
import { DiscoverySearchResults } from './DiscoverySearchResults';
import { useDiscoveryRoute } from '../../router/useDiscoveryRoute';

/**
 * DiscoveryMarketplace
 *
 * Single Discovery shell entry point. Customer search routes are delegated
 * to the canonical search-results experience while /discover remains Home.
 */
export const DiscoveryMarketplace: React.FC = () => {
  const { route, navigate } = useDiscoveryRoute();

  if (route.name === 'discover-search') {
    return <DiscoverySearchResults onReturnToStore={() => navigate('discover-home')} />;
  }

  return <DiscoveryHome />;
};
