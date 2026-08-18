export default function Page() {
  return (
    <main style={{ fontFamily: 'monospace', padding: 24 }}>
      <h1>P-002 throwaway probe</h1>
      <p>No secrets. No database. Delete this project after the evidence is committed.</p>
      <ul>
        <li>GET /api/probe/oembed — the 16 URLs from docs/evidence/tiktok/urls-set1.txt</li>
        <li>GET /api/probe/burst?n=200 — per-IP quota detection</li>
        <li>GET /api/probe/stream?seconds=30&amp;every=2000 — NDJSON incremental streaming + duration</li>
      </ul>
    </main>
  );
}
