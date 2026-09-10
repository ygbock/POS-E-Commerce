import assert from 'assert';
import fs from 'fs';
import path from 'path';

let testPassedCount = 0;
let testFailedCount = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log('PASSED');
    testPassedCount++;
  } catch (error: any) {
    console.log('FAILED');
    console.error(`    Error: ${error.message || error}`);
    testFailedCount++;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log(' UX-001 Phase 2.1 R2 — Static & Accessibility Verification');
  console.log('======================================================\n');

  console.log('  [INFO] Active Node Environment lacks a browser/DOM engine (no JSDOM/headless browser).');
  console.log('  [INFO] Verifying UI boundaries statically and documenting manual verification gates.\n');

  // Test 1: Verify ErrorBoundary.tsx contains correct safe messages and lacks raw diagnostics in production
  await runTest('1. Error Boundary production security and development diagnostics', () => {
    const filePath = path.join(process.cwd(), 'src/components/ui/ErrorBoundary.tsx');
    assert.ok(fs.existsSync(filePath), 'ErrorBoundary.tsx file should exist');
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for safe generic message
    assert.ok(
      content.includes('Something went wrong while loading the application. Your work has not been intentionally discarded.'),
      'Must contain generic user-friendly description'
    );
    assert.ok(
      content.includes('Please reload the application and try again.'),
      'Must guide the user to reload the application'
    );

    // Required check: must contain import.meta.env.DEV
    assert.ok(
      content.includes('import.meta.env.DEV'),
      'Raw error details must be guarded directly by import.meta.env.DEV'
    );

    // Forbidden checks: must not bypass via hostname checks
    const forbiddenBypasses = [
      "hostname === 'localhost'",
      "hostname === '127.0.0.1'",
      "location.hostname",
      "window.location.hostname",
      "localhost",
      "127.0.0.1"
    ];

    for (const bypass of forbiddenBypasses) {
      assert.ok(
        !content.includes(bypass),
        `Must not contain hostname-based bypass pattern: "${bypass}"`
      );
    }
  });

  // Test 2: Verify Modal.tsx uses useId and doesn't hardcode title ID
  await runTest('2. Modal dynamic accessibility identifiers (useId)', () => {
    const filePath = path.join(process.cwd(), 'src/components/ui/Modal.tsx');
    assert.ok(fs.existsSync(filePath), 'Modal.tsx file should exist');
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Verify useId is imported and used
    assert.ok(
      content.includes('useId'),
      'Modal must import and call useId()'
    );
    assert.ok(
      content.includes('titleId = useId()'),
      'Modal must assign useId() to titleId'
    );
    
    // Verify hardcoded "modal-title" string is removed for accessibility properties
    assert.ok(
      !content.includes('id="modal-title"'),
      'Modal must not hardcode the h2 title id attribute'
    );
    assert.ok(
      !content.includes('aria-labelledby="modal-title"'),
      'Modal must not hardcode the aria-labelledby title mapping'
    );
    assert.ok(
      content.includes('aria-labelledby={titleId}'),
      'Modal must bind aria-labelledby dynamically'
    );
    assert.ok(
      content.includes('id={titleId}'),
      'Modal header title must bind id dynamically'
    );
  });

  // Test 3: Verify focus trapping and accessibility parameters
  await runTest('3. Focus trapping and lifecycle mechanisms structure', () => {
    const filePath = path.join(process.cwd(), 'src/components/ui/Modal.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Verify key focus features are present in source
    assert.ok(content.includes('role="dialog"'), 'Must have role="dialog"');
    assert.ok(content.includes('aria-modal="true"'), 'Must have aria-modal="true"');
    assert.ok(content.includes('document.activeElement'), 'Must preserve previous active element state');
    assert.ok(content.includes('Escape'), 'Must implement Escape dismissal');
    assert.ok(content.includes('Tab'), 'Must trap Tab focus keys');
    assert.ok(content.includes('Shift+Tab'), 'Must support Shift+Tab backwards wrapping');
    assert.ok(content.includes('originalOverflow'), 'Must implement body scroll locking');
  });

  console.log('\n======================================================');
  console.log(' UX-001 Phase 2.1 R2 — Manual Verification Protocol');
  console.log('======================================================');
  console.log('  Verify these behaviors manually or via a browser-level E2E environment:');
  console.log('  1. Modal Receives Initial Focus:');
  console.log('     - Trigger a modal open. The first focusable element (or close button) must receive focus.');
  console.log('  2. Tab Trapping:');
  console.log('     - Navigate with Tab. When reaching the last focusable item, Tab wraps back to the first.');
  console.log('  3. Shift+Tab Wrapping:');
  console.log('     - Navigate backward with Shift+Tab. At the first item, it wraps back to the last item.');
  console.log('  4. Escape Dismissal:');
  console.log('     - Press the Escape key. The active modal must dismiss instantly.');
  console.log('  5. Focus Restoration:');
  console.log('     - On close, focus must return to the element that triggered the modal opening.');
  console.log('  6. Simultaneous Modal Instances ID Uniqueness:');
  console.log('     - Open nested or multiple side-by-side modals. Ensure their title IDs do not conflict.');
  console.log('  7. Production Error Boundary safety:');
  console.log('     - Simulate an exception under NODE_ENV=production. No raw stack/error messages must be visible.');
  console.log('  8. Development Error Boundary diagnostics:');
  console.log('     - Simulate an exception in local development mode. Raw exception stack and message should render.');
  console.log('======================================================\n');

  if (testFailedCount > 0) {
    console.error(`  [FAILURE] ${testFailedCount} checks failed.`);
    process.exit(1);
  } else {
    console.log(`  [SUCCESS] All ${testPassedCount} static/accessibility structural verification checks passed successfully.`);
  }
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
