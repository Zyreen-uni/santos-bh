// React app helper for the owner's Download buttons on the Payments page.
// File names look like 2026-10_Room-101_Juan-Dela-Cruz_OR-000001.webp
import JSZip from 'jszip';

function saveFile(blob, fileName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// "Download" on one payment row. proof is a row from supabase.rpc('proof_files').
export async function downloadProof(supabase, proof) {
  const { data, error } = await supabase.storage.from('proofs').download(proof.proof_path);
  if (error) throw error;
  saveFile(data, proof.file_name);
}

// "Download all" for one month, as one ZIP file. month is the first day, such as "2026-10-01".
// The ZIP also holds a CSV list with the tenant, room, amount, reference number and receipt.
export async function downloadMonthProofs(supabase, month, onProgress = () => {}) {
  const { data: proofs, error } = await supabase.rpc('proof_files', { p_month: month });
  if (error) throw error;
  if (!proofs.length) throw new Error('No GCash proofs for this month');

  const zip = new JSZip();
  const rows = [['File', 'Tenant', 'Room', 'Amount', 'GCash Reference', 'Status', 'Receipt']];
  for (const [i, p] of proofs.entries()) {
    const { data } = await supabase.storage.from('proofs').download(p.proof_path);
    if (data) zip.file(p.file_name, data);
    rows.push([p.file_name, p.tenant_name, p.room_number, p.amount, p.reference_no, p.payment_status, p.receipt_number || '']);
    onProgress(i + 1, proofs.length);
  }
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  zip.file('gcash-proofs-list.csv', csv);
  saveFile(await zip.generateAsync({ type: 'blob' }), `gcash-proofs-${month.slice(0, 7)}.zip`);
}
