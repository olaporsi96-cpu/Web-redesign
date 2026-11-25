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
- `SUB_ADMIN_ARCHIVING_ENABLED` — optional feature flag; set to `true` only after the matching database migration is installed.
- `RESEND_API_KEY` — server-only Resend API key for application transaction emails.
- `CONTACT_FROM_EMAIL` — verified sender address for application transaction emails.
- `E_LEARNING_ADMIN_EMAIL` — explicitly approved recipient for pending course-order notifications.

Use `.env.example` as a names-and-placeholders reference and configure the local application origin before sending invitations. Local and staging must use the approved development/TEST Supabase project, never the LIVE project. Do not copy secret values into `.env.example`, source control, or reports.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are embedded in client bundles at build time; build a staging package with the approved TEST project values. Keep `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` server-only and configure them in the runtime environment, not the browser bundle or deployment archive. Application transaction email uses Resend and requires all three Resend-related variables above. Configure Supabase Auth email separately in the TEST project's Authentication SMTP settings (or an officially supported Send Email Hook); setting `RESEND_API_KEY` does not configure Auth invitations, confirmations, or password recovery. Use a verified sender, correct staging redirect allow-list, and inspect both Supabase Auth and Resend delivery logs. Email delivery and allowed origins have not been verified end to end.

## Namecheap cPanel staging deployment

The staging application is `https://staging.adebolacollege.org`, with cPanel application root `adebola-staging`, Node.js `22.23.5`, and startup file `server.js`. Next.js 16.4.5 requires Node.js `>=20.9.0`, so the specified host runtime is compatible.

The build pins `@next/swc-wasm-nodejs` to the exact Next.js version as a fallback for Linux systems where native SWC cannot load because of shared-library compatibility. `npm run build` uses Webpack because Next.js requires native bindings for Turbopack when only WASM bindings are available. This workaround does not replace verifying the build on the target Linux/Node environment.

1. Build in the existing cPanel Linux Node.js `22.23.5` environment, or another verified Linux environment—not on Windows. From the application root, run `npm ci`, configure the approved TEST project's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL=https://staging.adebolacollege.org`, then run `npm test` and `npm run build`.
2. Package the successful Linux production build with the app runtime files, `public`, `.next` production output, `proxy.js`, `utils`, `package.json`, `package-lock.json`, `next.config.mjs`, `server.js`, and safe configuration/documentation. Exclude `.env.local`, every other private `.env` file, `node_modules`, `.git`, local caches, test/maintenance artifacts, and unrelated projects. Keep the output folder outside this application directory.
3. In cPanel **Setup Node.js App**, select Node.js `22.23.5`, Production mode, application root `adebola-staging`, application URL `staging.adebolacollege.org`, and startup file `server.js`.
4. Upload the deployment archive to the application root and extract its contents directly there. Use cPanel's production dependency installation (`npm ci --omit=dev`) and set the staging environment variables in the Node.js application settings. Set the public Supabase URL/key to the approved TEST project; set `NEXT_PUBLIC_SITE_URL` to the staging origin; set the TEST `SUPABASE_SERVICE_ROLE_KEY` only as a server-side environment variable. Do not configure production Supabase credentials on staging.
5. Restart the application and verify public pages, Supabase login/invitation redirects, role-restricted Admin/Student routes, and Supabase Storage flows. Configure the TEST Supabase Auth email provider and allow-list the staging origin and required callback routes before email-flow testing.

This project uses the normal Next.js production build and the Passenger `server.js` entry; standalone output is not enabled. Passenger must provide `PORT`; the server validates and listens on that value. Do not set a fixed port. No cPanel deployment, DNS change, or database operation is performed by these instructions.

## Implemented application areas

- Public school information pages, admissions sample-paper links, and Contact Us.
- Main-Admin-only Website Settings for public contact details and the homepage hero, backed by validated database settings and private image storage.
- Supabase email/password sign-in for Main Admin, Sub-Admins, and invited students.
- Server-side Admin route checks, permission-checked server actions, and RLS-backed data access.
- Student records, Admin result entry/status changes, student-specific released results, result slips, and browser printing.
- Course and lesson catalogue/management, protected PDF/MP4 lesson materials, student payment submissions, guest order requests, Admin review, manual course-access grants, and manual-grant revocation.
- Database query loading/error states and successful empty states for the data-backed views.

The application does not create sample students, courses, lessons, results, payments, or dashboard statistics. Contact Us retains the client-provided numbers `+2348035364720` and `+2348033628755`. The Admissions document provides the CBT account number `0008456903` and `contactus@adebola.org`; confirm those details with the owner before publication. No playable JSSENG111 MP4 was present in the workspace, so the course and lesson must not be published until the real video is attached through Admin > Course Materials. Employment-specific source copy was not supplied; that page only directs enquiries to the College without inventing employment terms.

## Database migrations and release status

Local migration files, in dependency order:

1. `supabase/migrations/20261101000100_initial_portal_schema.sql` — profiles, students, results, base Admin permissions, RLS, and bootstrap-function definition.
2. `supabase/migrations/20261103000100_atomic_result_save.sql` — atomic result and subject save function.
3. `supabase/migrations/20261104000100_admin_rbac.sql` — granular permissions and Sub-Admin enable/disable operations.
4. `supabase/migrations/20261104000300_student_invites.sql` — invited-student profile and record creation.
5. `supabase/migrations/20261104000400_enabled_main_admin.sql` — enabled-state enforcement for Main Admin database authorization.
6. `supabase/migrations/20261105000100_course_learning_payments.sql` — courses, lessons, materials, access grants, student/guest orders, storage buckets, policies, and RPCs.
7. `supabase/migrations/20261105000200_public_calendar_and_learning_video.sql` — public calendar and featured learning video configuration, policies, and storage bucket.
8. `supabase/migrations/20261106000100_release_permission_dependency.sql` — requires result-release permission to be assigned together with result-management permission.
9. `supabase/migrations/20261107000100_admin_workflows_and_calendar.sql` — Admin workflow and calendar authorization updates.
10. `supabase/migrations/20261108000100_enable_assigned_sub_admin_permissions.sql` — RLS access based on assigned Sub-Admin permissions.
11. `supabase/migrations/20261109000100_recoverable_account_archiving.sql` — recoverable student and Sub-Admin account archiving.
12. `supabase/migrations/20261123000100_guest_course_entitlements_and_expiry.sql` — additive TEST-only guest entitlements, seven-day paid expiry, receipt-required guest orders, account type, lesson details, secure access verification, initial entitlement management functions, and Website Settings persistence.
13. `supabase/migrations/20261124000100_security_and_settings.sql` — legacy RPC restrictions, audited individual/bulk revocation, repurchase audit history, Main-Admin-only Website Settings writes, private image-storage permissions, and guarded content deletion.
14. `supabase/migrations/20261125000100_uuid_safe_course_payment_settings.sql` — adds the payment account type and uses the existing settings row without assuming its primary-key type.
15. `supabase/migrations/20261125000200_course_lesson_metadata_alignment.sql` — repeat-safe repair for lesson description and duration columns plus the metadata-aware lesson-save RPC required by Admin and the public E-Learning catalogue.

Migration files do not prove that the matching schema is installed in Supabase. The TEST schema, migration history, and storage policies have not been inspected or changed as part of this implementation. Do not assume TEST is ready for end-to-end testing, and do not apply migrations as part of packaging or cPanel deployment. Before staging release, have the TEST schema, migration history/order, and RLS/storage policies reviewed and updated only through the separately approved database process. The one-time Main Admin bootstrap must not be rerun.

For the staging E-Learning and Website Settings update, first run the read-only `supabase/preflight/20261124000100_security_and_settings_preflight.sql` in the Supabase Dashboard with the TEST project selected. Confirm the existing private `course-materials` (50 MB) and `course-payment-proofs` (10 MB) bucket settings, the `lessons_title_check` definition, all required base RPCs/policies, and any existing Website Settings objects or Storage policies. Only after preflight and migration review pass, apply migration `20261123000100_guest_course_entitlements_and_expiry.sql`, followed by `20261124000100_security_and_settings.sql`, to TEST. Do not run either migration against LIVE. The first migration adds lesson description/duration fields and extends the existing lesson-title limit to 140 characters (the supplied title is 106 characters); existing lesson rows and descriptions are preserved. It also adds the `get_guest_course_access(text)` service-role-only RPC and requires the five-argument payment-review RPC for approval. Both migrations revoke execution from the legacy four-argument guest-order and payment-review signatures, so all approvals use the expiry-aware path. Website settings are publicly readable content, writable only through a Main-Admin-checked RPC, and the hero image is held in a private bucket served through a server-side image endpoint. No TEST database operation was performed by this implementation.

Guest buyers submit a private receipt before an order is created. Admins can approve a guest without linking a student profile; the app stores only a SHA-256 token digest and emails the bearer link after approval. Student and guest paid access expires exactly seven days after the database approval timestamp. Manual grants remain non-expiring unless revoked; revocation actor, timestamp, and reason are retained, including across student repurchase. Protected lesson pages recheck access server-side and issue private material URLs lasting 300 seconds. An already-issued Storage URL cannot be invalidated immediately; after revocation it may remain usable for up to five minutes, after which a fresh request is denied. Private URLs and download controls reduce casual copying, but cannot prevent external screen recording.

After the migration is applied to TEST, use Admin > Courses to create the supplied course `JSS1 English Language` (category `JSS`, price `500` NGN), then Admin > Lessons to create lesson code `JSSENG111`, title `Speech Work: Introduction to Speech (Production of Vowel and Consonant Sounds) Knowledge and Understanding`, and duration `45` minutes. Copy the supplied skills, prerequisites, and recommended textbooks into the lesson description from `docs/client-content/eLearning-Lesson-JSS-ENG111.docx`. Keep the course and lesson unpublished until the real MP4 is uploaded to private `course-materials`; do not commit the video or seed course records in a migration.

The owner supplied LIVE Supabase project reference `wgixuojzjznktfbqelza`. This task is limited to TEST; LIVE has not been accessed, verified, or modified. No production migration or database operation is authorized by this repository documentation.

## Content provenance

Keep the supplied school assets and entrance examination sample papers. The Admissions update follows the supplied source document. Confirm its CBT account details and `contactus@adebola.org` with the owner before publication. No employment-specific source document was supplied, so the Employment page avoids inventing job terms. Other school history and marketing claims are not independently verified by this implementation.
