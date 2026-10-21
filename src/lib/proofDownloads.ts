// The owner's Download buttons on the Payments page.
// File names look like 2026-10_Room-101_Juan-Dela-Cruz_OR-000001.webp
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';

// One row of supabase.rpc('proof_files').
export interface ProofFile {
  payment_id: number;
  tenant_name: string;
  room_number: string;
  billing_month: string;
  amount: number;
  reference_no: string | null;
  payment_status: 'pending' | 'verified' | 'rejected';
  receipt_number: string | null;
  proof_path: string;
  file_name: string;
}

function saveFile(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// "Download" on one payment row.
export async function downloadProof(supabase: SupabaseClient, proof: ProofFile) {
  const { data, error } = await supabase.storage.from('proofs').download(proof.proof_path);
  if (error) throw error;
  saveFile(data, proof.file_name);
}

// Builds the ZIP for one month: every proof plus a CSV list with the tenant, room, amount,
// reference number and receipt. month is the first day, such as "2026-10-01".
export async function buildMonthZip(
  supabase: SupabaseClient, month: string, onProgress: (done: number, total: number) => void = () => {},
) {
  const { data, error } = await supabase.rpc('proof_files', { p_month: month });
  if (error) throw error;
  const proofs = (data ?? []) as ProofFile[];
  if (!proofs.length) throw new Error('No GCash proofs for this month');

  const zip = new JSZip();
  const rows: unknown[][] = [['File', 'Tenant', 'Room', 'Amount', 'GCash Reference', 'Status', 'Receipt']];
  for (const [i, p] of proofs.entries()) {
    const { data: file } = await supabase.storage.from('proofs').download(p.proof_path);
    if (file) zip.file(p.file_name, file);
    rows.push([p.file_name, p.tenant_name, p.room_number, p.amount, p.reference_no, p.payment_status, p.receipt_number || '']);
    onProgress(i + 1, proofs.length);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  zip.file('gcash-proofs-list.csv', csv);
  return zip;
}

// "Download all" for one month, as one ZIP file.
export async function downloadMonthProofs(
  supabase: SupabaseClient, month: string, onProgress?: (done: number, total: number) => void,
) {
  const zip = await buildMonthZip(supabase, month, onProgress);
  saveFile(await zip.generateAsync({ type: 'blob' }), `gcash-proofs-${month.slice(0, 7)}.zip`);
}
