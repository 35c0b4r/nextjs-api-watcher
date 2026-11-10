import Link from 'next/link';

export default async function ServerPage() {
  const user = await fetch('https://jsonplaceholder.typicode.com/users/1', { cache: 'no-store' }).then((r) => r.json());
  await fetch('https://jsonplaceholder.typicode.com/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'from a server component', userId: 1 }),
    cache: 'no-store',
  });
  return (
    <main>
      <h1>Server page</h1>
      <p>Rendered on the server for {user.name}.</p>
      <Link href="/">Back home</Link>
    </main>
  );
}
