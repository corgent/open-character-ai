/**
 * Smoke tests — run against a live production server (`next start`).
 *
 * Asserts that the app boots and that key routes respond with the expected
 * status codes. Intended to catch "builds but doesn't run" failures:
 * missing env wiring, broken server startup, 5xx on critical pages, and
 * API routes that should be auth-gated accidentally becoming public.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node tests/smoke/run.mjs
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/** @type {Array<{name: string, path: string, expected: number[]}>} */
const checks = [
  { name: "homepage loads", path: "/", expected: [200] },
  { name: "login page loads", path: "/login", expected: [200] },
  { name: "pricing page loads", path: "/pricing", expected: [200] },
  { name: "characters API is publicly readable", path: "/api/characters", expected: [200] },
  { name: "chats API requires auth", path: "/api/chats", expected: [401] },
  { name: "unknown route returns 404", path: "/no-such-route-smoke", expected: [404] },
];

let failures = 0;

for (const check of checks) {
  try {
    const res = await fetch(`${BASE_URL}${check.path}`, { redirect: "manual" });
    const ok = check.expected.includes(res.status);
    if (ok) {
      console.log(`ok   ${check.name} — ${check.path} → ${res.status}`);
    } else {
      failures++;
      console.error(
        `FAIL ${check.name} — ${check.path} → ${res.status} (expected ${check.expected.join(" or ")})`,
      );
    }
    if (res.status >= 500) {
      failures++;
      console.error(`FAIL ${check.name} — ${check.path} returned a server error (${res.status})`);
    }
  } catch (err) {
    failures++;
    console.error(`FAIL ${check.name} — ${check.path} request error: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed against ${BASE_URL}`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} smoke checks passed against ${BASE_URL}`);
