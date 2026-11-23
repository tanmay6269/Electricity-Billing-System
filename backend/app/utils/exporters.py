"""CSV / PDF response helpers."""
import csv
import io

from fastapi.responses import Response, StreamingResponse


def csv_response(filename: str, columns: list[dict], rows: list[dict]) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([c["label"] for c in columns])
    for r in rows:
        writer.writerow([_safe(r.get(c["key"])) for c in columns])
    data = "﻿" + buf.getvalue()  # BOM so Excel opens UTF-8 (Rs/₹) correctly
    return StreamingResponse(
        iter([data]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _safe(v):
    """Prevent CSV formula injection when opened in Excel."""
    if v is None:
        return ""
    s = str(v)
    if s and s[0] in ("=", "+", "-", "@") and not _is_number(s):
        return "'" + s
    return s


def _is_number(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def pdf_response(filename: str, data: bytes, inline: bool = False) -> Response:
    disp = "inline" if inline else "attachment"
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'{disp}; filename="{filename}"'})
