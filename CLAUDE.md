# onys.online — Project Context for Claude Code

## What this is
A professional IT services marketplace. Structured, time-bounded tasks with 
fixed-scope contracts, video KYC, insurance verification, and escrow payments.

## Stack
- Node.js 20, TypeScript 5.4, Fastify 4 (apps/api)
- Prisma 5 with PostgreSQL 16 (schema in apps/api/prisma/schema.prisma)
- BullMQ 5 + Redis 7 (apps/workers)
- Next.js 14 App Router (apps/web)
- Zustand (state), LiveKit (video), Stripe Connect (payments)
- Azure Blob Storage, Azure Key Vault
- Monorepo via Turborepo

## Code conventions
- All API responses use: { success: true, data: {...} } or { success: false, error: { code, message } }
- All inputs validated with Zod before reaching service layer
- All DB queries via Prisma only — zero raw SQL
- Services in apps/api/src/services/, routes in apps/api/src/routes/
- Enums and Zod schemas in packages/shared/src/

## Key docs
The full technical spec is in /docs/ folder (7 Word documents).
Ask me to paste the relevant spec section if you need it.
```

Once that file exists, Claude Code automatically sees your open files and gives a much better sense of your immediate focus  — combined with `CLAUDE.md` it has everything it needs.

---

### Prompt 2 — Generate the schema (inside VS Code)

Click the spark icon, open a new Claude Code session, and type:
```
Read my CLAUDE.md for context.

Create the file apps/api/prisma/schema.prisma with the complete 
Prisma schema for onys.online.

I'll paste the spec now:

[PASTE PART 6.1 AND 6.2 FROM DOC 4 — the enums and models sections]

Rules:
- Use cuid() for all IDs
- Use @db.Decimal(10,2) for all money fields
- Include all @@index() declarations as specified
- Add comment on AuditLog: // APPEND ONLY — DB trigger prevents UPDATE/DELETE
- datasource db points to postgresql://postgres:postgres@localhost:5432/onys_dev

After creating the file, run: cd apps/api && pnpm prisma format
```

Claude Code will **create the file directly in your repo** and run the format command. You'll see a diff panel showing exactly what it wrote before it saves.

---

### Prompt 3 — Generate a complete module

After the schema is in place:
```
Read CLAUDE.md and apps/api/prisma/schema.prisma.

Implement the auth register endpoint. Create these files:
- packages/shared/src/schemas/auth.schema.ts  (Zod schemas)
- apps/api/src/services/auth.service.ts       (registerUser function)
- apps/api/src/routes/auth.routes.ts          (Fastify route)
- apps/api/src/services/__tests__/auth.test.ts (Vitest unit tests)

Spec:
- POST /api/v1/auth/register
- Body: email, password (min 12 chars, 1 uppercase, 1 number, 1 special), 
  account_type (customer|individual_contractor|organisation_admin), full_name
- Hash password with bcrypt cost 12
- Create User + matching profile in a Prisma transaction
- Generate JWT access token (15min, sub=user.id)
- Generate refresh token (64-byte hex, store bcrypt hash in RefreshToken table)
- Queue email via BullMQ queue 'email': { type:'verify-email', to, token }
- Write USER_REGISTERED to AuditLog
- Return 201: { success:true, data:{ access_token, refresh_token, user:{id,email,account_type} } }

Errors: 400 VALIDATION_ERROR (with fields array), 409 EMAIL_EXISTS

After creating all files, run: cd apps/api && pnpm typecheck
Tell me if there are any TypeScript errors.
```

This is where Claude Code shines — it creates **four files simultaneously**, checks the types, and tells you if anything is broken.

---

### Prompt 4 — Fix a specific file it can see

Once files exist, you can reference them directly with `@`:
```
@apps/api/src/services/auth.service.ts

The refresh token rotation logic is missing the reuse detection.
Currently it just checks expiry but doesn't check if used_at is already set.

Add this guard:
- If RefreshToken.used_at is not null, set used_at on this token AND 
  delete ALL refresh tokens for this user (token theft mitigation)
- Return 401 TOKEN_REUSE error

Also update @apps/api/src/services/__tests__/auth.test.ts to add 
test case A-08 from the spec: "Refresh: reused token → 401 TOKEN_REUSE 
+ all sessions revoked"
```

The `@filename` syntax tells Claude Code exactly which file to read — you can @-mention files with specific line ranges from your selection , so you can even do `@auth.service.ts#45-72` to point at specific lines.

---

### Prompt 5 — End-of-day review prompt

Before finishing each day:
```
Read these files I worked on today:
@apps/api/src/services/auth.service.ts
@apps/api/src/routes/auth.routes.ts

Do a quick security review:
1. Is every endpoint protected with the JWT preHandler hook?
2. Is every input going through Zod validation before service logic?
3. Is anything sensitive (passwords, tokens) appearing in response bodies or logs?
4. Any obvious injection or access control issues?

List findings as CRITICAL / HIGH / MEDIUM with the line number and exact fix.
```

---

## The Recommended Daily Workflow
```
Morning:
  1. Open VS Code
  2. Open Claude Code panel (Ctrl+Shift+P → "Claude Code: Open in New Tab")
  3. Check WBS task for today (Doc 2)
  4. Paste the spec for that module into Claude Code
  5. Let Claude Code generate the files

During the day:
  6. Use @ references to ask Claude about specific files
  7. Let Copilot autocomplete the repetitive parts
  8. Run pnpm test after every module

End of day:
  9. Run the security review prompt on everything you wrote
  10. Commit to your feature branch