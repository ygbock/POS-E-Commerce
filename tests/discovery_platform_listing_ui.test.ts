import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, 'src/components/platform/PlatformDiscoveryModerationView.tsx'), 'utf8');

assert.match(ui, /\/api\/platform\/discovery\/moderation\/listings/);
assert.match(ui, /Create listing/);
assert.match(ui, /Create Discovery listing/);
assert.match(ui, /setCreateListingOpen\(true\)/);
assert.match(ui, /business-owner claim is approved/);
assert.match(ui, /claimant_user_id/);
assert.match(ui, /DRAFT/);

console.log('Discovery platform listing UI contract: PASS');
