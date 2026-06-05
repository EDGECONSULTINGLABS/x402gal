import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const htmlPath = join(process.cwd(), "public", "infiltrateETHConf2026.html");
  const html = readFileSync(htmlPath, "utf-8");
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
