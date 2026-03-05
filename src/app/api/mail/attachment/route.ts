import { NextRequest, NextResponse } from "next/server";
import { getAttachmentData } from "@/lib/email-sender";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const messageId = searchParams.get("messageId");
  const attachmentId = searchParams.get("attachmentId");
  const account = searchParams.get("account") || undefined;
  const mimeType = searchParams.get("mimeType") || "application/octet-stream";
  const filename = searchParams.get("filename") || "attachment";

  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "messageId and attachmentId required" }, { status: 400 });
  }

  const result = await getAttachmentData(messageId, attachmentId, account);
  if (!result) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const buffer = Buffer.from(result.data, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
