import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { drainOtpQueue, queueReady } from "../../../../lib/password-reset-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const expected=process.env.CRON_SECRET || "";
  const received=(request.headers.get("authorization") || "").replace(/^Bearer /,"");
  const a=Buffer.from(expected), b=Buffer.from(received);
  if(!expected || a.length!==b.length || !timingSafeEqual(a,b))
    return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!queueReady()) return NextResponse.json({error:"Email sender not configured"},{status:503});
  try { return NextResponse.json({ok:true,...await drainOtpQueue(5)},
    {headers:{"Cache-Control":"no-store"}}); }
  catch { return NextResponse.json({error:"Worker failed"},{status:503}); }
}
