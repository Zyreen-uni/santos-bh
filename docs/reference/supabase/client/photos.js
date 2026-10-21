// React app helper: shrinks a photo in the browser before upload (1280 px WebP, about
// 150 KB). The storage buckets refuse files over 1 MB, so every upload goes through here.
import imageCompression from 'browser-image-compression';

export async function shrinkPhoto(file, maxSide = 1280) {
  const small = await imageCompression(file, {
    maxWidthOrHeight: maxSide, maxSizeMB: 0.3, fileType: 'image/webp', initialQuality: 0.75, useWebWorker: true,
  });
  return new File([small], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
}

// Tenant: upload a GCash proof to the tenant's own folder. Returns the path to save on the payment.
export async function uploadProof(supabase, userId, file) {
  const path = `${userId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from('proofs').upload(path, await shrinkPhoto(file));
  if (error) throw error;
  return path;
}

// Tenant manager or owner: upload a bill photo for a month, such as "2026-10".
export async function uploadBillPhoto(supabase, month, name, file) {
  const path = `${month}/${name}.webp`;
  const { error } = await supabase.storage.from('utility-bills').upload(path, await shrinkPhoto(file), { upsert: true });
  if (error) throw error;
  return path;
}

// Tenant: upload a new profile photo (512 px) to the tenant's own avatars folder.
// Returns the path to save in tenants.photo_path.
export async function uploadProfilePhoto(supabase, userId, file) {
  const path = `${userId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from('avatars').upload(path, await shrinkPhoto(file, 512));
  if (error) throw error;
  return path;
}
