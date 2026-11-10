async function echo(req: Request) {
  return Response.json({ method: req.method, received: await req.text() }, { status: 201 });
}
export { echo as POST, echo as PUT };
