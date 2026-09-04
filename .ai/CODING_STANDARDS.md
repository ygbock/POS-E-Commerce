# Engineering & Coding Standards

> **Document Version**: 1.0.0  
> **Status**: Authoritative Standards  
> **Task Association**: ARCH-001  

---

## 1. TypeScript Standards

- **Strict Mode**: Maintain full type safety. Avoid using `any` wherever possible. Use `unknown` with type guards for external or dynamic data.
- **Explicit Types & Interfaces**: Define data models and contract payloads in dedicated type files (e.g., `src/types/index.ts`). Export named interfaces and types.
- **No Type Casting Workarounds**: Avoid forcing types via `as unknown as TargetType` unless strictly necessary for third-party library interop, and document the reason.
- **Top-Level Imports**: Place all import statements at the top of the file. Group imports systematically:
  1. Core runtime/framework libraries (`react`, `express`)
  2. Third-party UI/utility libraries (`lucide-react`, `motion`)
  3. Internal contexts, services, and utilities
  4. Type definitions
- **Standard Enums**: Use standard TypeScript `enum` declarations or `const` object maps with `as const`. Do not use `const enum`.

---

## 2. React Standards

- **Functional Components & Hooks**: Write pure functional components using standard React 19 hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`).
- **State Granularity**: Avoid oversized, kitchen-sink context states where updates cause global component re-renders. Deconstruct state into focused domain contexts or hooks as the app evolves.
- **`useEffect` Safety**: Prevent infinite re-render loops. Never mutate state directly in a component body. Use primitive dependencies in dependency arrays wherever possible. Memoize object or function dependencies.
- **Single-Responsibility Components**: Extract large UI screens into focused sub-components under `src/components/{domain}/`.
- **CSS & Styling**: Use Tailwind CSS utility classes directly. Do not create auxiliary `.css` files. Do not use inline `style` tags unless computing dynamic positioning (e.g., dynamic barcode SVG coordinates).
- **Icons**: Import all icons from `lucide-react`. Do not create inline SVG icons.

---

## 3. Backend & API Design Standards

- **RESTful Endpoints**: Use standard HTTP methods and resource paths:
  - `GET /api/v1/resources` (List)
  - `GET /api/v1/resources/:id` (Detail)
  - `POST /api/v1/resources` (Create)
  - `PUT /api/v1/resources/:id` (Full update)
  - `PATCH /api/v1/resources/:id` (Partial update)
  - `DELETE /api/v1/resources/:id` (Delete)
- **Standard Response Envelope**:
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": { "total": 100, "page": 1, "limit": 20 }
  }
  ```
- **Error Response Envelope**:
  ```json
  {
    "success": false,
    "error": {
      "code": "INSUFFICIENT_STOCK",
      "message": "Requested 5 units of SKU-101, but only 2 are available.",
      "details": { "sku": "SKU-101", "available": 2, "requested": 5 }
    }
  }
  ```
- **HTTP Status Codes**: Use precise status codes (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`, `500 Internal Server Error`).

---

## 4. Validation & Sanitization

- **Explicit Schema Validation**: All incoming requests (`req.body`, `req.query`, `req.params`) must be validated before reaching application business logic.
- **No Mass Assignment**: Never pass unvalidated request bodies directly to persistence models.
- **String Sanitization**: Trim strings and strip dangerous characters from user-provided input before storage.

---

## 5. Error Handling Standards

- **Never Swallow Errors Silently**: Do not catch errors with empty catch blocks. Always log the error and return an informative, safe response.
- **Sanitize Client-Facing Errors**: Never expose stack traces, database schema names, internal IP addresses, or environment variables in client error responses.
- **Try/Catch & Async Middleware**: Wrap asynchronous Express route handlers in standard error-handling wrappers or pass errors to `next(err)`.

---

## 6. Database Access & Transactions

- **Repository Pattern**: Separate database queries from HTTP route handling. Route handlers coordinate requests; repositories execute queries.
- **Atomic Transactions**: Any operation modifying more than one table or updating balances alongside movement logs must execute inside a database transaction (`BEGIN ... COMMIT / ROLLBACK`).
- **Connection Hygiene**: Use connection pooling. Never leave open connections or transactions hanging.

---

## 7. Testing Standards

- **Unit Tests**: Test pure business logic (tax math, currency conversions, discount algorithms, journal entry balancing) independently of UI or database.
- **Integration Tests**: Test API routes with mocked or test databases, asserting both positive (HTTP 200/201) and negative (HTTP 400/401/403/409) outcomes.
- **No Fake Asserts**: Every test must assert genuine business outcomes. Never write tests that merely assert `true === true`.

---

## 8. Modularity & File Organization

- **Modularity Rule**: Keep files focused and under 400 lines where practical. Split oversized components into sub-components.
- **Directory Structure**:
  - `src/components/{domain}/`: UI components partitioned by functional domain.
  - `src/services/`: HTTP client services calling backend endpoints.
  - `src/context/`: Client state stores.
  - `src/types/`: TypeScript definitions and schemas.
  - `src/utils/`: Pure helper functions.
  - `server/`: Server-side application services, routes, middleware, and database models.

---

## 9. Logging & Observability

- **Structured Output**: Output logs with timestamps, log levels (`INFO`, `WARN`, `ERROR`), and relevant operation context.
- **No Sensitive Data**: Never log passwords, payment card numbers, CVVs, personal identity tokens, or secret keys.

---

## 10. Code Documentation

- **Self-Documenting Code**: Choose expressive, intention-revealing variable and function names.
- **JSDoc on Public APIs**: Document exported utility functions, service methods, and interfaces with concise JSDoc comments explaining parameters, return values, and thrown errors.
- **Explain "Why", Not "What"**: Use inline comments only to explain complex business rules, architectural constraints, or non-obvious edge cases.
