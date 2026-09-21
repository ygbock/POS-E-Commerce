# Discovery Business Permissions

AbaCha Discovery business access is scoped to the active membership in discovery_business_memberships.

| Permission | OWNER | MANAGER | STAFF |
|---|:---:|:---:|:---:|
| Business listing/profile | ✓ | ✓ | — |
| Listing submission/resubmission | ✓ | ✓ | — |
| Locations / hours | ✓ | ✓ | — |
| Services | ✓ | ✓ | ✓ |
| Leads / contacts / quotes | ✓ | ✓ | ✓ |
| Review responses | ✓ | ✓ | ✓ |
| Analytics | ✓ | ✓ | ✓ |
| Search aliases | ✓ | ✓ | — |
| Verification | ✓ | — | — |
| Visibility settings | ✓ | — | — |
| Team management | ✓ | ✓ | — |
| Store conversion | ✓ | — | — |

## Authorization rules

- OWNER has full business-scoped access.
- MANAGER has operational and listing-management access but cannot manage ownership-sensitive settings, verification, team roles, or store conversion.
- STAFF is limited to operational service, lead/quote, review-response, and analytics workflows.
- Membership must be active and belong to the requested business.
- Platform super_admin remains an explicit override.
- Business-scoped membership authorization is separate from the user's global users.role.

Server enforcement lives in server/services/discoveryBusinessAccess.ts; route guards use the same permission vocabulary and the business service enforces listing ownership for lifecycle/update operations.
