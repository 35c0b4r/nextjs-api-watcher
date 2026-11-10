export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name') ?? 'world';
  await new Promise((r) => setTimeout(r, 120));
  return Response.json({ message: `Hello ${name}`, time: new Date().toISOString(), items: [1, 2, 3] }, { headers: { 'x-powered-by-demo': 'yes' } });
}
