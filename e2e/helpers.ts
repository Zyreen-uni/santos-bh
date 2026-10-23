import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, type Page, type TestInfo } from '@playwright/test';

// Saves a full-page screenshot to reports/screens/<module id>/<name>-<laptop|tablet|phone>.png
// for the reviewer to compare with the designs.
export async function screen(page: Page, info: TestInfo, moduleId: string, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350); // let motion finish (every animation is under 300 ms)
  // With a popup open, take what the person sees: a full-page capture of a long page loses the popup.
  const popupOpen = await page.evaluate(() => !!document.querySelector('dialog[open]'));
  await page.screenshot({ path: `reports/screens/${moduleId}/${name}-${info.project.name}.png`, fullPage: !popupOpen });
}

// No horizontal scroll at any width (docs/design.md).
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// Test passwords from .env.test (written by npm run seed, git-ignored).
function testEnv() {
  const text = readFileSync('.env.test', 'utf8');
  return Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
export const passwordFor = (username: string) => (username === 'owner' ? testEnv().OWNER_PASSWORD : testEnv().TENANT_PASSWORD);

export async function login(page: Page, username: string, password = passwordFor(username)) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(username === 'owner' ? /\/admin$/ : /\/tenant$/);
}

// The menu for the current width: sidebar on laptop, rail on tablet, the sheet behind "Open menu" on phone.
export async function openMenu(page: Page, info: TestInfo) {
  if (info.project.name === 'phone') await page.getByRole('button', { name: 'Open menu' }).click();
}

// Local Supabase URL and public anon key from .env.local (written by npm run seed).
function localEnv() {
  const text = readFileSync('.env.local', 'utf8');
  return Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

// Calls the REST API straight, with the signed-in user's own access token from the page,
// to prove row level security refuses what the UI hides.
export async function restAsPageUser(page: Page, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key ? (JSON.parse(localStorage.getItem(key)!).access_token as string) : '';
  });
  expect(token).toBeTruthy();
  const env = localEnv();
  return page.request.fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data,
  });
}

// Uploads straight to Supabase Storage with the signed-in user's token, to check the bucket rules.
export async function storageUploadAsPageUser(page: Page, bucket: string, path: string, body: Buffer, contentType = 'image/webp') {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key ? (JSON.parse(localStorage.getItem(key)!).access_token as string) : '';
  });
  const env = localEnv();
  return page.request.post(`${env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    data: body,
  });
}

// A real PNG made on the spot (a picture of a bill), for "attach a photo" steps.
export function samplePng(width = 600, height = 800) {
  return sharp({ create: { width, height, channels: 3, background: { r: 240, g: 244, b: 250 } } }).png().toBuffer();
}
