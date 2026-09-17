import React from 'react';
import { DiscoveryHome } from './DiscoveryHome';

/**
 * DiscoveryMarketplace
 *
 * Serves as the primary discovery entry point in App.tsx / Sidebar,
 * delegating to the single canonical DiscoveryHome component.
 */
export const DiscoveryMarketplace: React.FC = () => {
  return <DiscoveryHome />;
};
