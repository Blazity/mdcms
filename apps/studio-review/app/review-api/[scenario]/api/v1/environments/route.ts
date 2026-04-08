export async function GET() {
  return Response.json({
    data: [
      {
        id: "env-staging",
        project: "marketing-site",
        name: "staging",
        extends: null,
        isDefault: true,
        createdAt: "2026-03-19T10:00:00.000Z",
      },
    ],
  });
}
