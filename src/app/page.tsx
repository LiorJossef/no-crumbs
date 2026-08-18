import { BUILD_INFO } from '@/domain/build-info';

/**
 * MS2's deliverable: a trivial page that proves the deploy pipeline is real
 * before any product screen exists. MS9/MS10 replace this with the marketing
 * surface; the /healthz route below is what the deploy check actually asserts.
 */
export default function Home() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 34 * 16 }}>
        <h1 style={{ fontSize: 28, margin: '0 0 8px', letterSpacing: '-0.02em' }}>P-002</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          A personal map of the places your feed recommended.
        </p>
        <p style={{ color: 'var(--muted)', margin: '24px 0 0', fontSize: 13 }}>
          Milestone MS2 — toolchain and deploy pipeline. Stage {BUILD_INFO.stage}.
        </p>
      </div>
    </main>
  );
}
