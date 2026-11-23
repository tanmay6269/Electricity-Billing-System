import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FlaskConical, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, downloadFile, errorMessage } from "@/services/api";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, SearchInput, Select, Textarea, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Alert, LoadingBlock } from "@/components/ui/States";
import type { Page, Reading } from "@/types";
import { currentPeriod, date, dateTime, number, period } from "@/utils/format";

const TYPE_TONE = { manual: "blue", simulated: "sky", imported: "gray" } as const;

export default function ReadingList() {
  const t = useTableState({ search: "", billing_period: "", reading_type: "" }, { by: "billing_period", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<Reading>>("/api/readings", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, search, billing_period: t.filters.billing_period, reading_type: t.filters.reading_type,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const columns: Column<Reading>[] = [
    { key: "id", header: "ID", render: (r) => <span className="text-ink-muted">#{r.id}</span>, hideOnMobile: true },
    { key: "customer", header: "Customer", render: (r) => <div><p className="font-medium text-ink">{r.customer_name}</p><p className="text-xs text-ink-muted">{r.customer_code} · {r.connection_code}</p></div> },
    { key: "meter_number", header: "Meter", hideOnMobile: true },
    { key: "billing_period", header: "Period", sortable: true, render: (r) => period(r.billing_period) },
    { key: "previous_reading", header: "Previous", align: "right", hideOnMobile: true, render: (r) => number(r.previous_reading) },
    { key: "current_reading", header: "Current", sortable: true, align: "right", render: (r) => number(r.current_reading) },
    { key: "units_consumed", header: "Units", sortable: true, align: "right", render: (r) => <b className="text-ink">{number(r.units_consumed)}</b> },
    { key: "reading_type", header: "Type", render: (r) => <Badge tone={TYPE_TONE[r.reading_type as keyof typeof TYPE_TONE] ?? "gray"}>{r.reading_type}</Badge> },
    { key: "reading_date", header: "Date", sortable: true, hideOnMobile: true, render: (r) => date(r.reading_date) },
    { key: "entered_by", header: "Entered by", hideOnMobile: true, render: (r) => <span className="text-xs">{r.entered_by ?? "-"}</span> },
    { key: "a", header: "", align: "right", render: (r) => <IconButton label="View / edit" onClick={(e) => { e.stopPropagation(); setSelected(r.id); }}><Pencil className="h-4 w-4" /></IconButton> },
  ];

  return (
    <div>
      <PageHeader title="Meter Readings" subtitle="Readings are entered by staff or simulated for demo. Units = current - previous."
        actions={
          <>
            <Button variant="outline" icon={<FlaskConical className="h-4 w-4" />} onClick={() => setSimOpen(true)}>Simulate month</Button>
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Import CSV</Button>
            <Link to="/app/readings/new"><Button icon={<Plus className="h-4 w-4" />}>Add reading</Button></Link>
          </>
        } />
      <Card>
        <Toolbar actions={
          <Button variant="outline" loading={exporting} icon={<Download className="h-4 w-4" />} onClick={async () => {
            setExporting(true);
            try { await downloadFile("/api/readings/export", { search, billing_period: t.filters.billing_period, reading_type: t.filters.reading_type }); }
            catch (e) { toast.error(errorMessage(e)); }
            finally { setExporting(false); }
          }}>Download report</Button>
        }>
          <SearchInput className="sm:w-72" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Search customer, connection, meter..." />
          <input type="month" aria-label="Billing month" className="input sm:w-44" value={t.filters.billing_period} onChange={(e) => t.setFilter("billing_period", e.target.value)} />
          <Select className="sm:w-40" value={t.filters.reading_type} onChange={(e) => t.setFilter("reading_type", e.target.value)} placeholder="All types"
            options={[{ value: "manual", label: "Manual" }, { value: "simulated", label: "Simulated" }, { value: "imported", label: "Imported" }]} />
          {(t.filters.search || t.filters.billing_period || t.filters.reading_type) && <Button variant="ghost" size="sm" onClick={t.reset}>Clear</Button>}
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort} onRowClick={(r) => setSelected(r.id)} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>

      <ReadingModal id={selected} onClose={() => setSelected(null)} onSaved={reload} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />
      <SimulateModal open={simOpen} onClose={() => setSimOpen(false)} onDone={reload} />
    </div>
  );
}

function ReadingModal({ id, onClose, onSaved }: { id: number | null; onClose: () => void; onSaved: () => void }) {
  const { data: r, loading, reload } = useApi<Reading>(id ? `/api/readings/${id}` : null);
  const [edit, setEdit] = useState({ current_reading: "", reading_date: "", remarks: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (r) setEdit({ current_reading: String(r.current_reading), reading_date: r.reading_date, remarks: r.remarks ?? "", reason: "" });
    setErr(null);
  }, [r]);
  const units = r ? Math.max(0, Number(edit.current_reading || 0) - r.previous_reading) : 0;

  const save = async () => {
    if (!r) return;
    setBusy(true);
    setErr(null);
    try {
      await api.put(`/api/readings/${r.id}`, { current_reading: Number(edit.current_reading), reading_date: edit.reading_date, remarks: edit.remarks, reason: edit.reason });
      toast.success("Reading updated (change recorded in the audit log)");
      reload();
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={r ? `Reading #${r.id} · ${r.connection_code}` : "Reading"} subtitle={r ? `${r.customer_name} · ${period(r.billing_period)}` : undefined}
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button loading={busy} disabled={edit.reason.trim().length < 5} onClick={save}>Save correction</Button></>}>
      {loading || !r ? <LoadingBlock /> : (
        <div className="space-y-5">
          {err && <Alert tone="error">{err}</Alert>}
          <Alert tone="info">Only the latest unbilled reading of a connection can be corrected. Every change needs a reason and is kept in history.</Alert>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Previous reading"><Input disabled value={number(r.previous_reading)} /></Field>
            <Field label="Current reading"><Input type="number" step="0.01" value={edit.current_reading} onChange={(e) => setEdit({ ...edit, current_reading: e.target.value })} /></Field>
            <Field label="Units consumed"><Input disabled value={number(units)} /></Field>
            <Field label="Reading date"><Input type="date" value={edit.reading_date} onChange={(e) => setEdit({ ...edit, reading_date: e.target.value })} /></Field>
            <Field label="Remarks" className="sm:col-span-2"><Input value={edit.remarks} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></Field>
            <Field label="Reason for change" required className="sm:col-span-3" hint="Required (min 5 characters)"><Textarea rows={2} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Change history</p>
            <ol className="space-y-2">
              {(r.history ?? []).map((h, i) => (
                <li key={i} className="rounded-lg border border-line p-3 text-xs">
                  <div className="flex justify-between gap-2"><b className="text-ink">{h.action === "reading.create" ? "Created" : "Edited"}</b><span className="text-ink-muted">{h.by} · {dateTime(h.created_at)}</span></div>
                  <p className="mt-1 text-ink-soft">{h.summary}</p>
                  {h.action === "reading.update" && h.old_values && h.new_values && (
                    <p className="mt-1 text-ink-muted">Current: {String(h.old_values.current_reading)} → {String(h.new_values.current_reading)} · Units: {String(h.old_values.units_consumed)} → {String(h.new_values.units_consumed)}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: { row: number; connection: string; units: number }[]; errors: { row: number; error: string }[] } | null>(null);
  useEffect(() => { if (open) { setFile(null); setResult(null); } }, [open]);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/api/readings/import", fd);
      setResult(data);
      if (data.created.length) { toast.success(`${data.created.length} readings imported`); onDone(); }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const sample = () => {
    const p = currentPeriod(-1);
    const csv = `connection_id,billing_period,current_reading,reading_date,remarks\nCON-00001,${p},15000,${p}-28,Sample row\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "readings_template.csv";
    a.click();
  };

  return (
    <Modal open={open} onClose={onClose} title="Import readings from CSV" size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button loading={busy} disabled={!file} onClick={upload} icon={<Upload className="h-4 w-4" />}>Upload & import</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Columns: <code className="rounded bg-slate-100 px-1">connection_id</code> (e.g. CON-00001) or <code className="rounded bg-slate-100 px-1">meter_number</code>, <code className="rounded bg-slate-100 px-1">billing_period</code> (YYYY-MM), <code className="rounded bg-slate-100 px-1">current_reading</code>, <code className="rounded bg-slate-100 px-1">reading_date</code> (YYYY-MM-DD), optional <code className="rounded bg-slate-100 px-1">remarks</code>. The same validation rules apply to every row.</p>
        <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={sample}>Download template</Button>
        <div onClick={() => fileRef.current?.click()} className="cursor-pointer rounded-xl border-2 border-dashed border-line p-8 text-center hover:border-brand-200 hover:bg-brand-50/30">
          <Upload className="mx-auto h-6 w-6 text-ink-faint" />
          <p className="mt-2 text-sm font-medium text-ink">{file ? file.name : "Click to choose a .csv file"}</p>
          <p className="text-xs text-ink-muted">Max 2 MB</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {result && (
          <div className="space-y-2">
            <Alert tone={result.errors.length ? "warn" : "success"}>{result.created.length} imported, {result.errors.length} rejected.</Alert>
            {result.errors.length > 0 && (
              <ul className="max-h-48 overflow-auto rounded-lg border border-line text-xs">
                {result.errors.map((e) => <li key={e.row} className="border-b border-line px-3 py-1.5 last:border-0"><b>Row {e.row}:</b> {e.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function SimulateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [p, setP] = useState(currentPeriod(0));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: { connection: string; units: number }[]; skipped: { connection: string; reason: string }[] } | null>(null);
  useEffect(() => { if (open) setResult(null); }, [open]);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/api/readings/simulate", { billing_period: p });
      setResult(data);
      toast.success(`${data.created.length} simulated readings created`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Generate simulated readings" subtitle="Demo helper: creates realistic readings for every active connection missing one."
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button loading={busy} onClick={run} icon={<FlaskConical className="h-4 w-4" />}>Generate</Button></>}>
      <div className="space-y-4">
        <Field label="Billing month"><Input type="month" value={p} max={currentPeriod(0)} onChange={(e) => setP(e.target.value)} /></Field>
        {result && (
          <Alert tone="success" title={`${result.created.length} created, ${result.skipped.length} skipped`}>
            {result.skipped.slice(0, 5).map((s) => <div key={s.connection} className="text-xs">{s.connection}: {s.reason}</div>)}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
