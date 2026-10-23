import { describe, expect, it, vi } from 'vitest';

// browser-image-compression needs a real browser; here it returns what the test says it made.
const compressed = vi.fn();
vi.mock('browser-image-compression', () => ({ default: (...a: unknown[]) => compressed(...a) }));

const { shrinkPhoto, MAX_UPLOAD_BYTES } = await import('@/lib/photos');

describe('shrinkPhoto (every upload goes through it, NFR-006)', () => {
  it('asks for a 1280 px WebP of about 300 KB and keeps the name', async () => {
    compressed.mockResolvedValueOnce(new Blob([new Uint8Array(150_000)], { type: 'image/webp' }));
    const out = await shrinkPhoto(new File([new Uint8Array(3_000_000)], 'bill-101.jpg', { type: 'image/jpeg' }));
    expect(compressed).toHaveBeenLastCalledWith(expect.any(File), expect.objectContaining({ maxWidthOrHeight: 1280, fileType: 'image/webp', maxSizeMB: 0.3 }));
    expect(out.name).toBe('bill-101.webp');
    expect(out.type).toBe('image/webp');
    expect(out.size).toBe(150_000);
  });

  it('uses 512 px for profile photos', async () => {
    compressed.mockResolvedValueOnce(new Blob([new Uint8Array(40_000)]));
    await shrinkPhoto(new File([new Uint8Array(10)], 'me.png'), 512);
    expect(compressed).toHaveBeenLastCalledWith(expect.any(File), expect.objectContaining({ maxWidthOrHeight: 512 }));
  });

  it('refuses a photo that is still over 1 MB after shrinking, so the form never uploads it', async () => {
    compressed.mockResolvedValueOnce(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]));
    await expect(shrinkPhoto(new File([new Uint8Array(10)], 'huge.jpg'))).rejects.toThrow('The photo is still over 1 MB after shrinking. Choose a smaller photo.');
  });
});
