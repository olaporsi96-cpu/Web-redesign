// import { readFile } from 'node:fs/promises';
// import { resolve } from 'node:path';

// const projectRef = 'jmxuffazlpcdwcpqnjau';
// const adminUserId = '5fe7a1f9-aa5d-4465-ab12-6db7a5710d69';

// function valueFromEnvFile(contents, name) {
//   const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//   const match = contents.match(new RegExp(`^\\s*${escapedName}\\s*=\\s*(.*?)\\s*$`, 'm'));
//   if (!match) return undefined;

//   const value = match[1];
//   if (
//     value.length >= 2 &&
//     ((value.startsWith('"') && value.endsWith('"')) ||
//       (value.startsWith("'") && value.endsWith("'")))
//   ) {
//     return value.slice(1, -1);
//   }
//   return value;
// }

// async function localEnvValue(name) {
//   try {
//     return valueFromEnvFile(
//       await readFile(resolve(process.cwd(), '.env.local'), 'utf8'),
//       name,
//     );
//   } catch (error) {
//     if (error.code === 'ENOENT') return undefined;
//     throw error;
//   }
// }

// async function main() {
//   const supabaseUrl =
//     process.env.NEXT_PUBLIC_SUPABASE_URL ??
//     (await localEnvValue('NEXT_PUBLIC_SUPABASE_URL'));
//   const serviceRoleKey =
//     process.env.SUPABASE_SERVICE_ROLE_KEY ??
//     (await localEnvValue('SUPABASE_SERVICE_ROLE_KEY'));

//   if (!supabaseUrl || !serviceRoleKey) {
//     throw new Error(
//       'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or the process environment.',
//     );
//   }

//   let projectUrl;
//   try {
//     projectUrl = new URL(supabaseUrl);
//   } catch {
//     throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
//   }

//   if (
//     projectUrl.protocol !== 'https:' ||
//     projectUrl.hostname !== `${projectRef}.supabase.co`
//   ) {
//     throw new Error('The configured URL does not match the confirmed Supabase project.');
//   }

//   const response = await fetch(
//     `${projectUrl.origin}/rest/v1/rpc/bootstrap_main_admin`,
//     {
//       method: 'POST',
//       headers: {
//         apikey: serviceRoleKey,
//         authorization: `Bearer ${serviceRoleKey}`,
//         'content-type': 'application/json',
//       },
//       body: JSON.stringify({ target_user_id: adminUserId }),
//     },
//   );

//   if (!response.ok) {
//     throw new Error(
//       `Bootstrap RPC failed with HTTP ${response.status}. No response body or credentials were printed.`,
//     );
//   }

//   console.log('Bootstrap RPC succeeded. Verify the Main Admin profile in Supabase.');
// }

// main().catch((error) => {
//   console.error(`Bootstrap did not complete: ${error.message}`);
//   process.exitCode = 1;
// });
