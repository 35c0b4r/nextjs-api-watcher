export async function GET() {
  const res = await fetch('https://jsonplaceholder.typicode.com/todos/2', { cache: 'no-store' });
  return Response.json({ proxied: await res.json() });
}
