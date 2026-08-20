import { redirect } from 'next/navigation';
import { createClient } from '@/app/_lib/supabase/server';
import { signOut } from '@/app/actions/sign-out';

// Placeholder for the real map (a separate task). Belt-and-suspenders auth check: the middleware
// already redirects an unauthenticated visitor server-side, but every doc under docs/ that
// mentions Supabase Auth repeats the same rule — a page that renders user data must call
// getUser() itself rather than trust a layer above it.
export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p>Map goes here, signed in as {user.email}</p>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
