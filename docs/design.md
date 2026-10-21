# UI design rules

The picked designs are in docs/reference/ui/. Open them in a browser (or screenshot them with Playwright) before you build a page. Match them closely: layout, labels, order of fields, chips, empty and error states.

## Style: C Soft Rounded
- Font: Plus Jakarta Sans (400, 500, 600, 700, 800) from Google Fonts.
- Page background `#EEF3F9`. Cards white `#FFFFFF`, radius 20 to 28 px, no heavy shadows.
- Buttons and chips are pills (radius 999 px).
- Navy `#0A2A5E` (sidebar, headings, primary buttons). Blue `#1670B8` (links, accents). Hover blue `#0A4A85`.
- Text `#14213D`, muted text `#46536D`, sidebar text `#DCE7F5`, borders `#E3EAF2` and `#C5D1E0`, soft fills `#F4F7FB` and `#E3EDF8`.
- Status chips: Paid / Resolved green `#1E6B3E` on `#E3F4EA`. Pending amber `#6B4A00` on `#FFF4DC`. Unpaid / Overdue red `#B42318` on `#FDECEA`.
- Money in pesos with the peso sign and commas: ₱1,830.
- Logos: docs/reference/ui/santos-logo.png (navy) and santos-logo-white.png (on navy). Copy them to public/.
- Put these values in Tailwind theme tokens. Do not hard-code hex values in components.

## Three layouts for every page
- Laptop 1280 px: navy sidebar with the logo and menu, white active pill.
- Tablet 768 px: navy icon rail.
- Phone 390 px: navy top bar with a menu button. The tenant phone dashboard uses tiles (8 tiles including Logout).
- Playwright checks every page at 1280x800, 768x1024 and 390x844. No horizontal scroll at any width.

## Design file for each page
| Page | Laptop | Tablet | Phone |
| --- | --- | --- | --- |
| Login, Register | C-Login.html, C-Register.html | same, centered | C-Phone.html |
| Admin Dashboard | Admin-A.html | Admin-A-Tablet.html | Admin-A-Phone.html |
| Manage Rooms | Rooms-B.html | Rooms-B-Tablet.html | Rooms-B-Phone.html |
| Manage Tenants | Tenants-B.html | Tenants-B-Tablet.html | Tenants-B-Phone.html |
| Manage Payments | Pay-A.html | Pay-A-Tablet.html | Pay-A-Phone.html |
| Utility Billing | Util-A.html | Util-A-Tablet.html | Util-A-Phone.html |
| Settings | Set-C.html | Set-C-Tablet.html | Set-C-Phone.html |
| Concerns (admin) | Con-B.html | Con-B-Tablet.html | Con-B-Phone.html |
| Announcements (admin) | Ann-A.html | Ann-A-Tablet.html | Ann-A-Phone.html |
| Tenant Dashboard | Ten-A.html | Ten-A-Tablet.html | Ten-A-Phone.html, Ten-A-Phone-Carla.html |
| My Profile and My Room | Prof-C.html | Prof-C-Tablet.html | Prof-C-Phone.html, Prof-C-Phone-Photo.html |
| My Payments | MyPay-A.html | MyPay-A-Tablet.html | MyPay-A-Phone.html |
| My Concerns and Announcements | MyCon-C.html | MyCon-C-Tablet.html | MyCon-C-Phone.html |
| History Logs | Log-C.html | Log-C-Tablet.html | Log-C-Phone.html |
| Logout | Out-A.html | Out-A-Tablet.html | Out-A-Phone.html |

## Motion primitives
Source: https://github.com/ibelick/motion-primitives (docs at motion-primitives.com/docs). The components are copied into the repo, not installed as one package. They need Tailwind CSS, `motion`, `lucide-react`, `clsx`, `tailwind-merge` and a `cn()` helper in `src/lib/utils.ts`. They import from `@/lib/utils` and `@/hooks/...`, so set the `@` alias to `src` in vite.config.ts and tsconfig.

Run `npx shadcn@latest init` once (Vite + Tailwind v4, aliases `@/components`, `@/lib/utils`, `@/hooks`). Then add a component with the shadcn route, which follows the aliases in components.json:
`npx shadcn@latest add "https://motion-primitives.com/c/<name>.json"`
Or with the project CLI: `npx motion-primitives@latest add <name>`. This one writes every file, hooks included, to `components/motion-primitives/` under the current folder, so move the files to `src/components/motion-primitives/` and the hooks to `src/hooks/` after.

Use these, and only where they help the user:
| Component | Use it for |
| --- | --- |
| dialog | Every popup: Change Monthly Rent?, Create Announcement, Submit GCash Proof, View Proof, Log Details on phone, Logout confirm |
| animated-background | Active pill in the sidebar and rail, status tabs on Manage Payments, tabs on My Concerns and Announcements |
| transition-panel | Content that changes with those tabs |
| animated-number | Dashboard counts, peso totals, storage percent, the live split in Utility Billing |
| animated-group | Room cards, tenant groups by room, announcement cards, dashboard tiles on phone |
| disclosure | Rooms grouped by building on phone, Log Details old and new values |
| text-effect | "Logged Out Successfully" and success notes such as "Payment Proof Sent" |

- Wrap the app in `<MotionConfig reducedMotion="user">` so people who turn off motion see none.
- Keep animations short (under 300 ms) and never block a click.
- The `'use client'` line at the top of each file is harmless in Vite. Leave it.
