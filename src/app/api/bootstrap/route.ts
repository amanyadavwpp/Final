import { ensureSeeded, getBootstrap } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const payload = await getBootstrap();
    return Response.json(payload);
  } catch (error) {
    console.error("bootstrap failed", error);
    return Response.json({ error: "Failed to load tracker data" }, { status: 500 });
  }
}
