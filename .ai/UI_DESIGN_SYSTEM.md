# POS-E-Commerce UI Design System

## Purpose
This document is the UI/UX contract for the application. New screens should reuse the shared visual language rather than introducing isolated styles.

## Product experiences
- Back Office: dense, operational, data-first workflows for owners, managers, inventory, finance and administration.
- POS: speed-first, touch-friendly, keyboard-friendly checkout workflow for cashiers.
- Storefront: customer-first shopping, discovery and checkout experience.

All three experiences share tokens, accessibility rules and interaction conventions, while retaining different information density.

## Visual principles
1. Clear hierarchy over decoration.
2. Consistent spacing and component behavior.
3. Semantic status colors: success, warning, danger and info.
4. Data tables are first-class product surfaces.
5. Important actions are obvious; destructive actions require confirmation.
6. Responsive layouts adapt workflow, not merely screen width.
7. Motion must respect prefers-reduced-motion.
8. UI authorization is a presentation concern; backend authorization remains the security boundary.

## Shared primitives
The initial token layer lives in src/index.css and defines surfaces, borders and text colors; primary and semantic colors; spacing; radius; elevation; focus ring; typography; tabular numbers; and reduced-motion behavior.

Prefer semantic CSS variables or existing Tailwind utilities over arbitrary new colors and spacing values.

## Application shell
Desktop: Sidebar -> Header -> Content viewport
Tablet/mobile: Drawer navigation -> Header -> Content viewport -> mobile navigation where appropriate
The shell must remain stable while modules change.

## Standard page anatomy
1. Page title and concise description.
2. Primary action(s).
3. KPI/summary region only when useful.
4. Search/filter toolbar.
5. Main content/table.
6. Loading, empty, error and permission-denied states.

## Data tables
Where appropriate, standard tables should support search, filtering, sorting, pagination, row actions, bulk actions, loading state, empty state and responsive behavior.

## Accessibility baseline
- Keyboard reachable interactive controls.
- Visible focus treatment.
- Icon-only controls require accessible labels.
- Do not communicate status by color alone.
- Preserve sufficient text/background contrast.
- Respect reduced-motion preferences.
- Dialogs and drawers must have predictable focus behavior.

## Module rollout order
1. Application shell and design tokens
2. Dashboard
3. Product management
4. Inventory
5. Orders
6. POS
7. Customers
8. Purchasing/suppliers
9. Reports
10. Settings
11. Storefront and checkout
12. Responsive/accessibility QA

## Definition of Done for UI work
A screen is not complete until desktop/mobile behavior, loading, empty, error, permission-aware actions, keyboard/focus behavior, consistent spacing/typography/status semantics, component reuse, and relevant tests have been checked.