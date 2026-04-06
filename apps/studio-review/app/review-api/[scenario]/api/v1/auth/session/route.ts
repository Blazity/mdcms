export async function GET() {
  return Response.json({
    data: {
      session: {
        id: "review-session-001",
        userId: "review-user-001",
        email: "reviewer@mdcms.local",
        issuedAt: "2026-04-01T09:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      csrfToken: "review-csrf-token",
    },
  });
}
