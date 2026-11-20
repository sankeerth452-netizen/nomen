/** A CSV file download that opens in Excel, Numbers or Google Sheets, with a safe file name. */
export function csvDownload(body: string, name: string): Response {
  const file = name.replace(/[^\w ·.-]+/g, "").replace(/\s+/g, " ").trim() || "download.csv";
  return new Response("﻿" + body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file.replace(/[^\x20-\x7e]+/g, "-").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file)}` },
  });
}
