"""PDF generation with ReportLab: invoices, payment receipts and tabular reports."""
from __future__ import annotations

import io
from datetime import datetime

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#0B1F3A")
BLUE = colors.HexColor("#2563EB")
MUTED = colors.HexColor("#64748B")
BORDER = colors.HexColor("#E2E8F0")
LIGHT = colors.HexColor("#F5F7FA")
STATUS_COLORS = {
    "paid": "#16A34A", "successful": "#16A34A", "partially_paid": "#EA580C", "pending": "#EA580C",
    "generated": "#2563EB", "overdue": "#DC2626", "failed": "#DC2626", "cancelled": "#94A3B8", "draft": "#94A3B8",
    "refunded": "#94A3B8",
}

styles = getSampleStyleSheet()
S_TITLE = ParagraphStyle("t", parent=styles["Title"], fontSize=18, textColor=NAVY, alignment=0, spaceAfter=2)
S_H = ParagraphStyle("h", parent=styles["Heading4"], textColor=NAVY, spaceBefore=6, spaceAfter=4)
S_N = ParagraphStyle("n", parent=styles["Normal"], fontSize=9, leading=12)
S_SMALL = ParagraphStyle("s", parent=S_N, fontSize=8, textColor=MUTED)
S_RIGHT = ParagraphStyle("r", parent=S_N, alignment=TA_RIGHT)


def rs(v) -> str:
    return f"Rs {float(v):,.2f}"


def _status_label(status: str) -> str:
    color = STATUS_COLORS.get(status, "#64748B")
    return f'<font color="{color}"><b>{status.replace("_", " ").upper()}</b></font>'


def _header(company: dict, doc_title: str, ref: str) -> Table:
    left = [
        Paragraph(f'<font color="#2563EB">&#9889;</font> {company["name"]}', S_TITLE),
        Paragraph(company["address"], S_SMALL),
        Paragraph(f'Care: {company["phone"]} &nbsp;|&nbsp; {company["email"]}', S_SMALL),
    ]
    right = [Paragraph(f"<b>{doc_title}</b>", ParagraphStyle("dt", parent=S_RIGHT, fontSize=14, textColor=NAVY)),
             Paragraph(ref, S_RIGHT)]
    t = Table([[left, right]], colWidths=[120 * mm, 60 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 1.5, NAVY),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def _kv_table(rows: list[tuple[str, str]], width=88 * mm) -> Table:
    data = [[Paragraph(f'<font color="#64748B">{k}</font>', S_N), Paragraph(str(v), S_N)] for k, v in rows]
    t = Table(data, colWidths=[width * 0.42, width * 0.58])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                           ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    return t


def _box(content, width) -> Table:
    t = Table([[content]], colWidths=[width])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, BORDER), ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                           ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    return t


def _qr(text: str, size=28 * mm) -> Drawing:
    w = QrCodeWidget(text)
    b = w.getBounds()
    d = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
    d.add(w)
    return d


def invoice_pdf(bill, company: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm,
                            bottomMargin=14 * mm, title=f"Invoice {bill.invoice_number}")
    c, conn = bill.customer, bill.connection
    snap = bill.tariff_snapshot or {}
    els = [_header(company, "ELECTRICITY BILL", f"Invoice No: <b>{bill.invoice_number}</b>"), Spacer(1, 6)]

    cust = _kv_table([
        ("Customer", f"<b>{c.full_name}</b>"), ("Customer ID", c.customer_code),
        ("Address", f"{c.address}, {c.city}, {c.state} {c.postal_code}"), ("Category", c.customer_type.title()),
    ])
    acct = _kv_table([
        ("Connection ID", conn.connection_code), ("Meter No.", conn.meter.meter_number),
        ("Billing Period", bill.billing_period), ("Issue Date", bill.issue_date.strftime("%d %b %Y")),
        ("Due Date", f"<b>{bill.due_date.strftime('%d %b %Y')}</b>"), ("Status", _status_label(bill.status)),
    ])
    t = Table([[_box(cust, 88 * mm), _box(acct, 88 * mm)]], colWidths=[91 * mm, 91 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    els += [t, Spacer(1, 8)]

    els.append(Paragraph("Meter Reading", S_H))
    mr = Table([["Previous Reading", "Current Reading", "Units Consumed (kWh)", "Tariff"],
                [f"{float(bill.previous_reading):,.2f}", f"{float(bill.current_reading):,.2f}",
                 f"{float(bill.units_consumed):,.2f}", Paragraph(f'{snap.get("name", "")} ({snap.get("billing_method", "")})', S_N)]],
               colWidths=[40 * mm, 40 * mm, 45 * mm, 57 * mm])
    mr.setStyle(_grid_style())
    els += [mr, Spacer(1, 6)]

    els.append(Paragraph("Charges Breakdown", S_H))
    rows = [["Description", "Units", "Rate", "Amount"]]
    for it in bill.items:
        rows.append([Paragraph(it.description, S_N),
                     f"{float(it.units):,.2f}" if it.units is not None and it.item_type in ("slab", "flat") else "",
                     f"{float(it.rate):,.2f}" if it.rate is not None and it.item_type in ("slab", "flat") else "",
                     rs(it.amount)])
    rows.append(["", "", Paragraph("<b>Total Payable</b>", S_N), Paragraph(f"<b>{rs(bill.total_amount)}</b>", S_N)])
    rows.append(["", "", "Amount Paid", rs(bill.amount_paid)])
    rows.append(["", "", Paragraph("<b>Balance Due</b>", S_N),
                 Paragraph(f'<font color="#DC2626"><b>{rs(bill.balance_due)}</b></font>', S_N)])
    ch = Table(rows, colWidths=[100 * mm, 22 * mm, 25 * mm, 35 * mm])
    st = _grid_style()
    st.add("ALIGN", (1, 1), (-1, -1), "RIGHT")
    st.add("BACKGROUND", (0, len(rows) - 3), (-1, len(rows) - 1), LIGHT)
    ch.setStyle(st)
    els += [ch, Spacer(1, 10)]

    if bill.status == "cancelled":
        els.append(Paragraph(f'<font color="#DC2626"><b>CANCELLED:</b> {bill.cancel_reason or ""}</font>', S_N))
    pay = [Paragraph("Payment Instructions", S_H), Paragraph(company["payment_instructions"], S_N),
           Spacer(1, 4), Paragraph("Online payments in this system run in <b>Demo Payment Mode</b> - no real money is transferred.", S_SMALL)]
    q = Table([[pay, _qr(f"{bill.invoice_number}|{conn.connection_code}|{float(bill.balance_due):.2f}")]],
              colWidths=[145 * mm, 37 * mm])
    q.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), 0.6, BORDER)]))
    els += [q, Spacer(1, 8),
            Paragraph(f"Computer-generated invoice. Generated on {datetime.now().strftime('%d %b %Y %H:%M')}.", S_SMALL)]
    doc.build(els)
    return buf.getvalue()


def receipt_pdf(payment, company: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm,
                            bottomMargin=14 * mm, title=f"Receipt {payment.receipt_number}")
    bill, c = payment.bill, payment.customer
    els = [_header(company, "PAYMENT RECEIPT", f"Receipt No: <b>{payment.receipt_number or '-'}</b>"), Spacer(1, 10)]
    rows = [
        ("Customer", f"<b>{c.full_name}</b> ({c.customer_code})"),
        ("Invoice Number", bill.invoice_number), ("Billing Period", bill.billing_period),
        ("Transaction ID", payment.transaction_id), ("Payment ID", payment.payment_code),
        ("Payment Date", payment.payment_date.strftime("%d %b %Y %H:%M")),
        ("Payment Method", payment.method.replace("_", " ").title()),
        ("Amount Paid", f"<b>{rs(payment.amount)}</b>"), ("Status", _status_label(payment.status)),
        ("Bill Balance After Payment", rs(bill.balance_due)),
    ]
    els += [_box(_kv_table(rows, 176 * mm), 180 * mm), Spacer(1, 10),
            Paragraph("<b>Demo Payment Mode:</b> this receipt records a simulated payment. No real money was transferred.", S_SMALL),
            Spacer(1, 4), Paragraph(f"Generated on {datetime.now().strftime('%d %b %Y %H:%M')}.", S_SMALL)]
    doc.build(els)
    return buf.getvalue()


def _grid_style() -> TableStyle:
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])


def table_report_pdf(title: str, columns: list[dict], rows: list[dict], company: dict, filters: str = "",
                     summary: dict | None = None) -> bytes:
    buf = io.BytesIO()
    wide = len(columns) > 6
    size = landscape(A4) if wide else A4
    doc = SimpleDocTemplate(buf, pagesize=size, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm,
                            bottomMargin=12 * mm, title=title)
    usable = size[0] - 24 * mm
    els = [Paragraph(company["name"], S_SMALL), Paragraph(title, S_TITLE)]
    els.append(Paragraph(f"Generated {datetime.now().strftime('%d %b %Y %H:%M')}" + (f" &nbsp;|&nbsp; {filters}" if filters else ""), S_SMALL))
    els.append(Spacer(1, 6))
    if summary:
        els.append(Paragraph(" &nbsp;&nbsp; ".join(f"<b>{k}:</b> {v}" for k, v in summary.items()), S_N))
        els.append(Spacer(1, 6))
    data = [[Paragraph(f'<font color="white"><b>{c["label"]}</b></font>', S_SMALL) for c in columns]]
    for r in rows:
        data.append([Paragraph(_fmt(r.get(c["key"]), c.get("type")), S_SMALL) for c in columns])
    if len(data) == 1:
        data.append([Paragraph("No records for the selected filters.", S_SMALL)] + [""] * (len(columns) - 1))
    t = Table(data, colWidths=[usable / len(columns)] * len(columns), repeatRows=1)
    t.setStyle(_grid_style())
    els.append(t)
    doc.build(els)
    return buf.getvalue()


def _fmt(v, typ=None) -> str:
    if v is None:
        return "-"
    if typ == "money":
        return rs(v)
    if isinstance(v, float):
        return f"{v:,.2f}"
    return str(v)
