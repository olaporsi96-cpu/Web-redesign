# Adebola College website

The website uses Next.js 16 App Router, React 19, and Supabase Auth/Postgres. Run commands from this directory.

## Local development

Install dependencies and run the local app:

```bash
npm ci
npm run dev
```

Available checks:

```bash
npm test
npm run build
```

There are no separate lint, TypeScript, or security-scan scripts in `package.json`.

## Supabase configuration

Configure these variables in the local environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` — the application origin used when creating student and Sub-Admin invitations.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used by invitation actions. Never expose it to browser code or commit it.

The checked local Supabase URL targets the TEST project `jmxuffazlpcdwcpqnjau`. Do not replace it with a production URL without the owner's confirmation. The current `.env.local` does not define `NEXT_PUBLIC_SITE_URL`, so invitations cannot be sent until the correct local/test application origin is configured. Do not copy secret values into this file or any report.

Configure Supabase Auth redirect allow-lists for the intended application origin and the invitation/password-recovery callback routes before testing email-based flows. Email delivery and allowed origins have not been verified end to end.

## Implemented application areas

- Public school information pages, admissions sample-paper links, and Contact Us.
- Supabase email/password sign-in for Main Admin, Sub-Admins, and invited students.
- Server-side Admin route checks, permission-checked server actions, and RLS-backed data access.
- Student records, Admin result entry/status changes, student-specific released results, result slips, and browser printing.
- Course and lesson catalogue/management, protected PDF/MP4 lesson materials, student payment submissions, guest order requests, Admin review, manual course-access grants, and manual-grant revocation.
- Database query loading/error states and successful empty states for the data-backed views.

The application does not create sample students, courses, lessons, results, payments, or dashboard statistics. Contact Us retains the client-confirmed numbers `+2348035364720` and `+2348033628755`. Other public school claims and contact details should be confirmed by the owner before production publication; they have not been altered in this audit.

## Database migrations and release status

Local migration files, in dependency order:

1. `supabase/migrations/20261101000100_initial_portal_schema.sql` — profiles, students, results, base Admin permissions, RLS, and bootstrap-function definition.
2. `supabase/migrations/20261103000100_atomic_result_save.sql` — atomic result and subject save function.
3. `supabase/migrations/20261104000100_admin_rbac.sql` — granular permissions and Sub-Admin enable/disable operations.
4. `supabase/migrations/20261104000300_student_invites.sql` — invited-student profile and record creation.
5. `supabase/migrations/20261104000400_enabled_main_admin.sql` — enabled-state enforcement for Main Admin database authorization.
6. `supabase/migrations/20261105000100_course_learning_payments.sql` — courses, lessons, materials, access grants, student/guest orders, storage buckets, policies, and RPCs.
7. `supabase/migrations/20261106000100_release_permission_dependency.sql` — result-release permission dependency.

Migration files do not prove that the matching schema is installed in Supabase. A prior read-only inspection of TEST found that the atomic result-save RPC and the course/payment schema were not present there. Do not assume the current TEST schema is ready for end-to-end testing, and do not apply migrations until their order, current schema, and RLS/storage policies have been reviewed. The one-time Main Admin bootstrap must not be rerun.

The owner supplied LIVE Supabase project reference `wgixuojzjznktfbqelza`. This task is limited to TEST; LIVE has not been accessed, verified, or modified. No production migration or database operation is authorized by this repository documentation.

## Content provenance

Keep the supplied school assets and entrance examination sample papers. Public school history, contact address/email, and marketing claims remain as currently written pending owner provenance review; do not treat unverified copy as approved facts.
