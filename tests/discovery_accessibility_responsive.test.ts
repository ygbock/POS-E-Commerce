import assert from 'assert';
import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
const expectIncludes = (content: string, needle: string, message: string) => assert.ok(content.includes(needle), message);

async function main() {
  console.log('\n======================================================');
  console.log(' DISC-PAGE-012 — Accessibility & Responsive Hardening');
  console.log('======================================================\n');

  const filters = read('src/components/discovery/DiscoveryFilters.tsx');
  const verification = read('src/components/discovery/VerificationStatusInfo.tsx');
  const map = read('src/components/discovery/DiscoveryMapPanel.tsx');
  const nav = read('src/components/discovery/DiscoveryMobileBottomNav.tsx');
  const profile = read('src/components/discovery/DiscoveryBusinessProfile.tsx');
  const css = read('src/index.css');

  expectIncludes(filters, 'useModalFocusTrap', 'Filter drawer must use the shared focus trap.');
  expectIncludes(filters, 'role="dialog"', 'Filter drawer must expose dialog semantics.');
  expectIncludes(filters, 'aria-modal="true"', 'Filter drawer must declare modal semantics.');
  expectIncludes(filters, 'aria-labelledby="discovery-filters-title"', 'Filter drawer must have a stable accessible title.');
  expectIncludes(filters, 'min-h-[44px]', 'Discovery filter controls must meet the 44px touch target baseline.');
  expectIncludes(verification, "event.key === 'Escape'", 'Verification popover must support Escape dismissal.');
  expectIncludes(verification, 'aria-controls="discovery-verification-info"', 'Verification trigger must identify its expanded content.');
  expectIncludes(map, 'aria-label="Interactive map of Discovery locations"', 'Map iframe must have an accessible label.');
  expectIncludes(map, 'min-h-[44px]', 'Map actions must meet the 44px touch target baseline.');
  expectIncludes(nav, 'aria-label="Discovery mobile navigation"', 'Mobile navigation must have an accessible landmark label.');
  expectIncludes(nav, 'min-h-[48px]', 'Mobile navigation controls must provide comfortable touch targets.');
  expectIncludes(profile, 'pb-24 lg:pb-8', 'Business profile must reserve space for the mobile bottom navigation.');
  expectIncludes(css, 'overflow-x: clip', 'Global layout must prevent accidental horizontal overflow.');
  expectIncludes(css, 'prefers-reduced-motion', 'Global accessibility styles must respect reduced-motion preferences.');

  console.log('  [PASS] Discovery drawers, popovers, map controls and mobile navigation meet the static accessibility contract.');
  console.log('  [PASS] Responsive overflow safety and mobile navigation spacing are present.');
  console.log('\nDISC-PAGE-012 accessibility/responsive static verification passed.\n');
}

main().catch((error) => {
  console.error('DISC-PAGE-012 verification failed:', error);
  process.exit(1);
});
