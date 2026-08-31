/**
 * A no-op stand-in for the `server-only` package, for the **manual** harnesses alone.
 *
 * The real package throws on import so that a server module can never be pulled into a client
 * bundle. That guarantee is enforced where it matters — Next.js at build time, and
 * `eslint.config.mjs`'s restricted zones plus `npm run check:layers` in CI. A harness that runs in
 * Node and legitimately needs `place-resolver-factory.ts` or `service-role-client.ts` is not a
 * client bundle, and the throw is a false positive there.
 *
 * **This alias is registered in `tests/manual/vitest.manual.config.ts` and must never be added to
 * the root `vitest.config.ts`.** The unit suite currently imports no server-only module at all, and
 * that is a property worth keeping: aliasing it there would let a unit test quietly reach across
 * the boundary and would hide exactly the layering break the guard exists to catch.
 */
export {};
