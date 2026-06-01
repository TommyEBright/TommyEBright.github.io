# HTML Gallery — Deployment Guide

A shared, real-time HTML file gallery. One `index.html`. No build step.

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (the free tier is enough).
2. Click **New project**, give it a name, choose a region close to your users, and wait ~60 seconds for provisioning.
3. Once the dashboard loads, open **Project Settings → API** (left sidebar) and copy two values — you will need them in Step 3:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** — the long JWT string under *Project API keys*

---

## Step 2 — Run the SQL

1. In the Supabase dashboard, open **SQL Editor** from the left sidebar.
2. Click **New query**, then paste the entire contents of `supabase-setup.sql`.
3. Click **Run** (or press `Cmd/Ctrl + Enter`).  
   You should see: `Success. No rows returned.`

This creates the `uploads` table, enables Row Level Security with public read/insert/delete policies, and adds the table to the realtime publication so live updates work across browsers.

---

## Step 3 — Add your credentials and deploy

1. Open `index.html` in any text editor.
2. Near the top of the `<script>` block, find these two lines and replace the placeholder strings:

```js
const SUPABASE_URL      = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'
```

   For example:

```js
const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

3. Save the file.
4. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag `index.html` onto the page.
5. Netlify gives you a live URL in seconds. Share it — every visitor sees the same gallery, updated in real time.

---

## Notes

- **Storage:** HTML files are stored in Supabase (Postgres). The free tier includes 500 MB of database storage, which is ample for hundreds of files.
- **Real-time:** A green dot appears in the top-left corner once the live connection is established. Uploads and deletes made by any user appear instantly in all open tabs.
- **Export / Import:** Use the Export button to download a JSON backup of all files. Use Import to restore from a backup. Existing rows (matched by UUID) are skipped on re-import to avoid duplicates.
- **The anon key is safe to expose** in a public HTML file — it only grants the permissions defined by your RLS policies (read, insert, delete on `uploads`). No other tables or user data are accessible.
