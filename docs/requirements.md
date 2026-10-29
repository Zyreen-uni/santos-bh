# Requirements (from the revised paper)

Source: docs/reference/paper/SantosBoardingHouse-revised-preview.pdf. Every module must name the FR ids it covers.

## Functional requirements
- FR-001 (HIGH): The system shall record room information including room number, building, capacity of up to 8 tenants, and status.
- FR-002 (HIGH): The system shall allow the admin to add, edit, deactivate, and view rooms.
- FR-003 (HIGH): The system shall display room availability, occupancy, rent per tenant, and capacity.
- FR-004 (HIGH): The system shall record tenant information including full name, username, email, contact number, room assignment, and date started.
- FR-005 (HIGH): The system shall allow tenants to register an account, and allow the admin to add, edit, view, and deactivate tenant records.
- FR-006 (HIGH): The system shall allow the admin to assign tenants to rooms and view their rental history.
- FR-007 (HIGH): The system shall record monthly bills and payments including tenant name, room number, rent share, electric share, water share, total amount, payment date, payment method, and payment status.
- FR-008 (HIGH): The system shall allow tenants to view their monthly bill breakdown (rent, electric share, water share, and total), payment history, balance, due date, payment status, and receipts.
- FR-009 (HIGH): The system shall display payment status as paid, unpaid, pending, or overdue.
- FR-010 (HIGH): The system shall allow tenants to upload proof of payment such as a GCash screenshot.
- FR-011 (HIGH): The system shall allow the admin to verify payment proof and generate a receipt.
- FR-012 (HIGH): The system shall allow tenants to submit concerns and view the admin response and concern status.
- FR-013 (HIGH): The system shall allow the admin to view, respond to, and update the status of concerns.
- FR-014 (HIGH): The system shall allow the admin to create, edit, delete, and publish announcements.
- FR-015 (HIGH): The system shall allow tenants to view announcements.
- FR-016 (HIGH): The system shall allow users to log in with a username and password, open the admin or tenant dashboard based on the account, and log out.
- FR-017 (HIGH): The system shall show the admin a dashboard of rooms, tenants, pending and overdue payments, recent concerns, and the latest announcement, and storage used with a warning at 80%, and show tenants a dashboard of their room, amount due, payment status, and latest announcements.
- FR-018 (HIGH): The system shall allow tenants to view and update their profile, change or remove their profile photo, and view their assigned room and monthly rent.
- FR-019 (HIGH): The system shall allow the tenant manager, a tenant the admin assigns, to enter each month the electric bill amount in pesos of each room's meter and of the rest house meter that powers the water pump, and to upload a photo of each bill. The admin may also enter or correct these amounts.
- FR-020 (HIGH): The system shall split each room's electric bill equally among the active tenants in that room (up to 8), and split the rest house bill equally among all active tenants in both buildings as the water share.
- FR-021 (HIGH): The system shall compute each tenant's monthly bill as rent share plus electric share plus water share as soon as the utility bills are saved, and show it on the tenant dashboard.
- FR-022 (HIGH): The system shall allow the admin to set, in Settings, one general monthly rent that every tenant pays and the payment due day (1 to 28). The system shall ask the admin to confirm a rent change before saving it and shall apply the new rent from the next month's bills.
- FR-023 (HIGH): The system shall allow the admin to assign any active tenant as the tenant manager, allow only one tenant manager at a time, and remove the role when that tenant is marked inactive.
- FR-024 (HIGH): The system shall allow the admin and all tenants to view each month's utility bill amounts and bill photos.
- FR-025 (HIGH): The system shall record every change to rooms, tenants, room assignments, settings, utility bills, monthly bills, payments, receipts, concerns, and announcements in a history log with the user, date, action, and old and new values. The admin shall view all history logs, and each tenant shall view the logs about their own records.
- FR-026 (HIGH): The system shall allow the admin to download the GCash proof images tenants upload, one payment at a time or all proofs of a month as one ZIP file with a list of the payments.
- FR-027 (HIGH): The system shall create each active tenant's monthly bill for the month by the 1st, with the rent, even before the utility bills are entered, and shall keep a month's bill split fixed to the tenants billed at the start of the month.
- FR-028 (HIGH): The system shall allow the admin to reset a tenant's password, and allow every user to change their own password after entering the current one.
- FR-029 (HIGH): The system shall allow the admin to record a cash or GCash payment the admin received directly, save it as paid with the next receipt number at once, and refuse an amount above the bill's balance.
- FR-030 (HIGH): The system shall keep each concern as a conversation between the tenant and the admin (the tenant's report, the admin's replies and the tenant's answers), and use the admin's latest reply as the concern's response.
- FR-031 (MEDIUM): The system shall allow a tenant to change their own username, which becomes their new login, and refuse a username that is taken or badly formed.
- FR-032 (MEDIUM): The system shall show a tenant their roommates (name and date started only) and their room's 8 bed spaces, each marked taken, open or not used.
- FR-033 (HIGH): The system shall allow the admin to set the GCash account name and number in Settings, and show them to tenants on My Payments when they send a GCash proof.

## Non-functional requirements
- NFR-001 Usability: The system shall use a simple, intuitive interface that admins and tenants can operate without training.
- NFR-002 Compatibility: The system shall run on desktop and mobile devices through a web browser.
- NFR-003 Security: The system shall require a username and password for login, with separate access levels for admin, tenant manager, and tenant accounts.
- NFR-004 Security: The system shall restrict tenants to viewing only their own personal, room, and payment information.
- NFR-005 Reliability: The system shall back up the database every day so records survive a system failure.
- NFR-006 Storage: The system shall shrink photos before upload, refuse files over 1 MB, and replace photos older than 12 months with smaller copies, so all records and history logs fit the free hosting plan.

## User stories

### Owner (admin)
1. As an Owner, I want to view the dashboard so that I can see the overall status of the boarding house.
2. As an Owner, I want to manage rooms so that I can keep room information, prices, capacity, and availability updated.
3. As an Owner, I want to manage tenant records so that I can keep tenant information and rental history organized.
4. As an Owner, I want to view room status so that I can see which rooms are occupied or available.
5. As an Owner, I want to manage payments so that I can record, view, and monitor tenant payment status.
6. As an Owner, I want to generate payment records and receipts so that tenant payments are properly documented.
7. As an Owner, I want to manage tenant concerns so that I can view, respond to, and resolve their concerns.
8. As an Owner, I want to manage announcements so that I can share important information with tenants.
9. As an Owner, I want to verify proof of payment so that I mark a payment as paid only after I confirm it.
10. As an Owner, I want to log in and log out so that only I can access the admin functions.
11. As an Owner, I want to view and correct the utility bills the tenant manager enters so that each tenant's share stays accurate.
12. As an Owner, I want to set one monthly rent for all tenants in Settings and confirm it before it changes so that every tenant pays the same rent and I avoid mistakes.
13. As an Owner, I want to assign an active tenant as the tenant manager so that someone enters the utility bills when I am away.
14. As an Owner, I want to view the history logs so that I can see who changed a record, when, and what changed.
15. As an Owner, I want to download the GCash proofs tenants upload so that I keep my own copy of every payment.
16. As an Owner, I want to see how much storage the system uses so that I know before it runs out.

### Tenant
1. As a Tenant, I want to view my dashboard so that I can see my boarding house information.
2. As a Tenant, I want to view and update my profile and change my profile photo so that my information stays updated.
3. As a Tenant, I want to view my room information so that I can see my assigned room and monthly rent.
4. As a Tenant, I want to view my payment information so that I can check my payment history, balance, and status.
5. As a Tenant, I want to upload proof of payment so that the Owner can verify my payment.
6. As a Tenant, I want to manage my concerns so that I can submit and monitor my concerns and read the Owner's response.
7. As a Tenant, I want to view announcements so that I can stay informed about boarding house updates.
8. As a Tenant, I want to register an account so that I can access the system.
9. As a Tenant, I want to view my receipt so that I have proof of my payment.
10. As a Tenant, I want to log in and log out so that only I can see my account.
11. As a Tenant, I want to see my rent, electric share, and water share so that I know what my monthly bill covers.
12. As a Tenant, I want to see the utility bills and their photos so that I can check how my share was computed.
13. As a Tenant, I want to view the history of changes to my records so that I can check my bills and payments.

### Tenant Manager
1. As a Tenant Manager, I want to enter the electric bill of each room and of the rest house so that the system computes every tenant's share.
2. As a Tenant Manager, I want to upload a photo of each bill so that the owner and the tenants can check the amounts.
3. As a Tenant Manager, I want to keep all my tenant features so that I can still view and pay my own bill.
