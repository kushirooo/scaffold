# US02 seam — `account.created` payload contract

| Field | Value |
|---|---|
| Owner | US18 (implementer) |
| Consumers | US02 (account creation), US18 welcome email |
| Status | Active — US02 owner confirmation tracked separately |
| Plan | `SPRINT1_PLAN.md` §11.1–§11.6 |
| Related | [ADR 0004 — email transport and failure semantics](adr/0004-email-transport.md) |

US02 depends on this payload contract, not on US18's controller, DTOs, services or transport.

## 1. Contract

```ts
// backend/app/src/accounts/account-events.ts — US18-owned, stable
import type { UserRole } from '../users/user.types.js';

export const ACCOUNT_CREATED = 'account.created' as const;

export interface AccountCreatedPayload {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  occurredAt: Date;
  correlationId: string; // request id, or randomUUID() from US02
}
```

`userId` is the correlation key: email, role and name can change; the id cannot.

## 2. The rule

**Emit `account.created` only after the creating transaction has committed — never inside it.** A failed welcome email must not roll back or fail account creation (US18 AC3).

US02 does not import `EmailModule`, the email sender or any transport adapter. It imports only the constant and payload type above.

## 3. Default wiring: domain event after commit

Paste-ready in US02's creation method, after the transaction commits:

```ts
// The transaction has committed and `user` is persisted.
const payload = {
  userId: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  occurredAt: new Date(),
  correlationId: requestId,
} satisfies AccountCreatedPayload;

this.events.emit(ACCOUNT_CREATED, payload);
```

`EventEmitterModule.forRoot()` is already registered in `AppModule`, so this needs no new dependency.

## 4. Fallback wiring: direct call

If US02 prefers not to emit, the same handler is callable after the same commit:

```ts
await this.welcome.handleAccountCreated(payload);
```

`WelcomeEmailService.handleAccountCreated` is public, safe to call directly, and never throws. `WelcomeEmailListener` is a thin `@OnEvent(ACCOUNT_CREATED)` adapter over that same service, so exactly one email path exists either way.

## 5. Guarantees and consequences

- **The handler never throws.** A send or token failure is logged, one best-effort admin alert is attempted, and the request that created the account still succeeds.
- **One email path only.** Listener and direct call run the same handler; never add a second send.
- **Duplicate emits send duplicate emails.** Each issue re-issues the INVITE token and marks the user's previous unused INVITE row used, so at most one link works — but duplicate emails are user-visible, so emit once per account.
- **The schema stays US18-owned.** US02 requests fields; it does not edit `prisma/schema.prisma` or the token tables.

## 6. Confirmation checklist

- [ ] US02 owner accepts the payload shape.
- [ ] US02 owner chooses event (default) or direct call.
- [ ] The payload is emitted after commit, not inside the transaction.
- [ ] US02 imports neither `EmailModule` nor a transport adapter.
