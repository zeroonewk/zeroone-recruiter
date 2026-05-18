export async function GET() {
  return Response.json({
    has_database_url: !!process.env.DATABASE_URL,
    has_auth_secret: !!process.env.AUTH_SECRET,
    auth_secret_length: process.env.AUTH_SECRET?.length ?? 0,
  });
}
