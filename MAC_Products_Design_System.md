# MAC Products — UI/UX Design System

This file defines the standard design language, component patterns, and architectural conventions for **all MAC Products internal web applications**. Every new project must follow these guidelines to ensure a consistent, professional experience across the organization.

Design philosophy inspired by enterprise-grade platforms (Vercel, Palantir Foundry) — prioritize **density with clarity**, **keyboard-first workflows**, **progressive disclosure**, and **F-shaped information hierarchy**.

> **AI INSTRUCTION — Azure Resource Limitations:**
> The AI assistant can generate all application code, SQL scripts, config files, and workflow YAML — but it **cannot** create or configure Azure cloud resources (App Registrations, SQL Servers, Static Web Apps, Function Apps, etc.) or obtain credentials/tokens. Whenever the AI scaffolds a new project, it **must**:
> 1. Use clear placeholders (e.g., `YOUR_CLIENT_ID`, `YOUR_TENANT_ID`, `process.env.AZURE_SQL_SERVER`) for all values that come from the Azure Portal.
> 2. **Proactively explain to the user** the step-by-step process to create each required Azure resource and where to find the values that replace the placeholders. Do not assume the user knows how — walk them through the Azure Portal UI.
> 3. Provide all SQL `CREATE TABLE` / `CREATE INDEX` scripts so the user can run them in Azure Data Studio, SSMS, or the Portal Query Editor.
> 4. Remind the user about cross-resource wiring (e.g., adding redirect URIs to the App Registration after creating the Static Web App, linking the database to the Function App, configuring firewall rules).
>
> Each section below that involves Azure resources has its own detailed block with specific setup instructions the AI should relay to the user.

---

## Brand Colors & Theme

Always use the MAC Products color palette. Define these as Tailwind config extensions or CSS variables:

```js
// tailwind.config — extend.colors.mac
mac: {
  navy:    '#1a365d',   // Primary brand dark — sidebar, modals, primary buttons
  blue:    '#2c5aa0',   // Secondary — hover states, gradients
  light:   '#f0f4f8',   // App background
  accent:  '#3182ce',   // Interactive elements, links, active states
  surface: '#ffffff',   // Card/panel background
  muted:   '#64748b',   // Secondary text, placeholders
}
```

### Status Colors (consistent across all apps)

| Status   | Background   | Text          | Border        | Border-Left (KPI cards) |
|----------|-------------|---------------|---------------|------------------------|
| Critical | `red-50`    | `red-600`     | `red-200`     | `red-500`              |
| Warning  | `orange-50` | `orange-600`  | `orange-200`  | `orange-500`           |
| Active   | `blue-50`   | `blue-600`    | `blue-200`    | `mac-accent`           |
| Success  | `green-50`  | `green-600`   | `green-200`   | `green-500`            |
| Neutral  | `slate-50`  | `slate-600`   | `slate-200`   | `slate-300`            |

### Dark Mode (Optional — Future)

For apps that require dark mode, extend the palette with CSS custom properties scoped to `[data-theme="dark"]`. Do not hard-code colors — always reference variables or Tailwind tokens so theming is a single-point change.

---

## Typography

```html
<!-- Always load these fonts in index.html -->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

```js
// tailwind fontFamily
fontFamily: {
  sans: ['DM Sans', 'system-ui', 'sans-serif'],
  mono: ['Space Mono', 'monospace'],
}
```

| Context | Font | Example Class |
|---------|------|---------------|
| All body text, headings, nav | `DM Sans` | `font-sans` |
| UI labels, badges, version tags, timestamps, code, IDs | `Space Mono` | `font-mono` |
| Section labels | — | `text-[10px] font-bold uppercase tracking-wider text-slate-400` |
| Page titles | — | `text-xl font-bold text-slate-800` |
| Card headings | — | `text-sm font-bold text-slate-700` |

### Typographic Hierarchy

Maintain a strict hierarchy so users can scan pages using an F-shaped reading pattern. KPIs and critical numbers should be the largest elements (`text-3xl font-bold`). Secondary labels should be small and muted (`text-[10px] uppercase text-slate-400`). Body text sits at `text-sm`.

---

## App Layout Structure

Every app uses a two-panel layout: a collapsible sidebar + main content area. The sidebar is the persistent navigation anchor (left rail). Content flows left-to-right, top-to-bottom.

```tsx
<div className="flex h-screen overflow-hidden bg-mac-light">
  <aside className="sidebar flex flex-col w-64 transition-all duration-300 flex-shrink-0 text-white">
    {/* Logo + user info */}
    {/* Navigation items */}
    {/* Sign Out button */}
    {/* Collapse toggle */}
  </aside>
  <main className="flex-1 flex flex-col overflow-hidden">
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
      {/* Page title + breadcrumbs (left) */}
      {/* Actions + version tag (right) */}
    </header>
    <div className="flex-1 overflow-y-auto p-6">
      {/* Page content */}
    </div>
  </main>
</div>
```

### Layout Best Practices

- **Information density**: Pack data tightly using grids and compact tables — but preserve whitespace between logical sections. Avoid the "wall of data" anti-pattern.
- **Progressive disclosure**: Show summary KPIs at the top of every dashboard view. Detailed tables and drill-downs live below the fold or behind expand/modal interactions.
- **F-shaped hierarchy**: Place the most important metrics and navigation in the top-left. Filters and configuration live in the left column or top bar. Content flows to the right.
- **Breadcrumbs**: Use breadcrumbs in the header for apps with more than two levels of navigation depth.
- **Responsive behavior**: Sidebar collapses to icon-only on narrow viewports. Main content should use `grid` with `auto-fit` for card layouts.

---

## Sidebar

```css
/* sidebar gradient — always use this */
.sidebar {
  background: linear-gradient(180deg, #1a365d 0%, #1e3a5f 100%);
}
```

### Logo / Header Block
```tsx
<div className="p-4 border-b border-white/10">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
      <img src="/mac_logo.png" alt="MAC Logo" className="w-full h-full object-contain" />
    </div>
    <div className="overflow-hidden">
      <h1 className="font-bold text-sm truncate uppercase">APP NAME</h1>
      <p className="text-blue-200 text-[10px] truncate uppercase font-bold tracking-tighter">
        {currentUser}
      </p>
    </div>
  </div>
</div>
```

### Navigation Items
```tsx
// Active state
className="w-full flex items-center gap-3 px-4 py-3 text-sm nav-active text-white bg-white/10"

// Inactive state
className="w-full flex items-center gap-3 px-4 py-3 text-sm text-blue-200 hover:text-white hover:bg-white/5"
```

```css
/* Active nav indicator bar */
.nav-active {
  position: relative;
}
.nav-active::before {
  content: '';
  position: absolute;
  left: 0; top: 50%;
  transform: translateY(-50%);
  width: 3px; height: 60%;
  background: #3b82f6;
  border-radius: 0 4px 4px 0;
}
```

### Navigation Grouping

For apps with 6+ nav items, group them under section labels:

```tsx
<p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-blue-300/50">
  Operations
</p>
{/* Nav items for this section */}
```

### Sign Out Button
```tsx
<div className="p-4 border-t border-white/10">
  <button onClick={handleLogout}
    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-blue-200 hover:text-white hover:bg-white/5 rounded-lg transition-all">
    <LogoutIcon className="w-5 h-5 flex-shrink-0" />
    <span className="font-medium">Sign Out</span>
  </button>
</div>
```

### Collapse Toggle

Every sidebar must support collapse to icon-only mode. Store the collapsed state in `localStorage` so it persists across sessions.

---

## Microsoft SSO Authentication

All MAC Products apps use **Microsoft Entra ID (Azure AD)** via MSAL. Always use `@azure/msal-browser` + `@azure/msal-react`.

> **AI INSTRUCTION — Cannot Create Azure Resources:**
> The AI assistant **cannot** create the Azure App Registration, configure redirect URIs, or obtain the `clientId` / `tenantId` values. When scaffolding a new app, the AI should:
> 1. Generate all auth code with `"YOUR_CLIENT_ID"` and `"YOUR_TENANT_ID"` placeholders.
> 2. **Explain to the user** how to create the App Registration in the Azure Portal:
>    - Navigate to **Azure Portal → Microsoft Entra ID → App registrations → New registration**
>    - Set the app name (e.g., "MAC - App Name")
>    - Set **Supported account types** to "Accounts in this organizational directory only (Single tenant)"
>    - Add a **Redirect URI** of type "Single-page application (SPA)" with the value `http://localhost:5173` for local dev and the production URL for deployment
>    - After creation, copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page
>    - Paste these into `authConfig.ts` replacing the placeholders
> 3. Remind the user to also add the production URL as a redirect URI before deploying.

### Auth Config (`authConfig.ts`)
```ts
import { Configuration, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "YOUR_CLIENT_ID",          // Azure App Registration client ID
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID",
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: { cacheLocation: "sessionStorage" },
};

export const loginRequest = { scopes: [] };
export const ALLOWED_DOMAIN = "macproducts.net"; // Enforce org domain
```

### Entry Point (`index.tsx`)
```tsx
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './authConfig';

const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.initialize().then(() => {
  msalInstance.handleRedirectPromise().then((response) => {
    if (response) msalInstance.setActiveAccount(response.account);
    else {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) msalInstance.setActiveAccount(accounts[0]);
    }
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>
  );
});
```

### Login Screen (`components/Login.tsx`)
```tsx
export const Login: React.FC<{ onLogin: (email: string) => void }> = ({ onLogin }) => {
  const { instance, accounts, inProgress } = useMsal();

  useEffect(() => {
    if (inProgress === 'none' && accounts.length > 0) {
      const email = accounts[0].username?.toLowerCase() || '';
      if (email.endsWith(`@${ALLOWED_DOMAIN}`)) onLogin(email);
      else { /* show error, logout */ }
    }
  }, [accounts, inProgress]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-mac-light px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <img src="/mac_logo.png" className="w-16 h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800">App Name</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in with your MAC Products account</p>
        </div>
        <button
          onClick={() => instance.loginRedirect(loginRequest)}
          className="w-full bg-[#2F2F2F] hover:bg-[#1F1F1F] text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </button>
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            MAC PRODUCTS INTERNAL SYSTEM
          </p>
        </div>
      </div>
    </div>
  );
};
```

### Checking Auth in App.tsx
```tsx
const { instance, accounts } = useMsal();
const isAuthenticated = useIsAuthenticated();

useEffect(() => {
  if (isAuthenticated && accounts.length > 0) {
    setCurrentUser(accounts[0].username?.toLowerCase() || null);
  }
}, [isAuthenticated, accounts]);

const handleLogout = async () => {
  await instance.logoutPopup();
  setCurrentUser(null);
};
```

---

## Azure SQL Database

**All MAC Products apps now use Azure SQL Database as the primary data store.** We have migrated away from Supabase. All new projects must use the Azure SQL stack described below.

> **AI INSTRUCTION — Cannot Create Azure Resources:**
> The AI assistant **cannot** create Azure SQL servers/databases, Azure Functions apps, or configure networking/firewall rules. When scaffolding a new app, the AI should:
> 1. Generate all API code with `process.env.*` placeholders for connection details.
> 2. **Explain to the user** how to create the Azure SQL resources:
>    - **Create the SQL Server:** Azure Portal → SQL servers → Create → choose a server name, admin login, and password. Select the MAC Products subscription and resource group.
>    - **Create the Database:** Within the SQL server, click "Create database" → name it, choose a pricing tier (Standard S0 is fine for most internal apps), and create.
>    - **Configure Firewall:** On the SQL server → Networking → add the Azure Functions outbound IPs and/or check "Allow Azure services and resources to access this server."
>    - **Get Connection Info:** From the database Overview, copy the server name (e.g., `yourserver.database.windows.net`) and database name for environment variables.
>    - **Create Tables:** Use Azure Data Studio, SSMS, or the Azure Portal Query Editor to run the SQL `CREATE TABLE` statements the AI provides.
> 3. **Explain how to set up the Azure Functions app:**
>    - Azure Portal → Function App → Create → select Node.js runtime, choose the same resource group, pick a hosting plan (Consumption is fine for internal apps).
>    - Under Configuration → Application settings, add `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`, and (for password auth) `AZURE_SQL_USER` / `AZURE_SQL_PASSWORD`.
>    - For production, explain how to enable **Managed Identity** on the Function App and grant it `db_datareader` + `db_datawriter` roles on the database.
> 4. Provide the SQL `CREATE TABLE` scripts for all required tables so the user can run them manually.

### Architecture

```
React Frontend (Azure Static Web Apps)
        ↓ HTTPS
Azure Functions (Node.js / TypeScript) — API layer
        ↓ Managed Identity or connection string
Azure SQL Database
```

> **CRITICAL:** React apps **never** connect directly to Azure SQL. All database access goes through an API layer — either Azure Functions, Azure App Service, or Azure Static Web Apps' built-in Database Connections feature (Data API builder).

### Option A: Azure Functions API (Recommended)

Use Azure Functions as the backend API. Each function maps to a REST endpoint.

**`api/src/db.ts`** — Database connection helper:
```ts
import sql from 'mssql';

const config: sql.config = {
  server: process.env.AZURE_SQL_SERVER!,        // e.g. "myserver.database.windows.net"
  database: process.env.AZURE_SQL_DATABASE!,
  authentication: {
    type: 'azure-active-directory-default',     // Use Managed Identity (preferred, passwordless)
  },
  options: {
    encrypt: true,                              // Required for Azure SQL
    trustServerCertificate: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Alternative: connection string auth (for local dev)
// If using connection string instead of Managed Identity:
// const config: sql.config = {
//   server: process.env.AZURE_SQL_SERVER!,
//   database: process.env.AZURE_SQL_DATABASE!,
//   user: process.env.AZURE_SQL_USER!,
//   password: process.env.AZURE_SQL_PASSWORD!,
//   options: { encrypt: true, trustServerCertificate: false },
// };

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}
```

**Example Function (`api/src/functions/getProjects.ts`):**
```ts
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { getPool } from '../db';

app.http('getProjects', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'projects',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM projects ORDER BY created_at DESC');
    return { jsonBody: result.recordset };
  },
});
```

### Option B: SWA Database Connections (Data API builder)

For simpler CRUD apps, use Azure Static Web Apps' built-in database connections. Configure in `swa-db-connections/staticwebapp.database.config.json`:

```json
{
  "$schema": "https://github.com/Azure/data-api-builder/releases/latest/download/dab.draft.schema.json",
  "data-source": {
    "database-type": "mssql",
    "connection-string": "@env('DATABASE_CONNECTION_STRING')"
  },
  "entities": {
    "Project": {
      "source": "dbo.projects",
      "permissions": [
        { "role": "authenticated", "actions": ["read", "create", "update"] }
      ]
    }
  }
}
```

This auto-generates REST and GraphQL endpoints at `/data-api/rest/Project` and `/data-api/graphql`.

### Frontend API Client (`api.ts`)

```ts
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API Error ${res.status}: ${error}`);
  }
  return res.json();
}

// Usage
export const api = {
  projects: {
    list: () => apiFetch<Project[]>('/projects'),
    get: (id: number) => apiFetch<Project>(`/projects/${id}`),
    create: (data: Partial<Project>) =>
      apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Project>) =>
      apiFetch<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
  },
};
```

### Environment Variables

```bash
# Azure Functions (.env / Azure App Settings)
AZURE_SQL_SERVER=your-server.database.windows.net
AZURE_SQL_DATABASE=your-database
AZURE_SQL_USER=your-user            # Only for local dev with password auth
AZURE_SQL_PASSWORD=your-password    # Only for local dev with password auth

# React app (.env)
VITE_API_BASE=/api                  # Proxied in dev, same-origin in production
```

### Key Differences from Supabase

| Concern | Supabase (Old) | Azure SQL (New) |
|---------|---------------|-----------------|
| Client library | `@supabase/supabase-js` (direct from frontend) | `mssql` (server-side only via Azure Functions) |
| Auth | Supabase Auth or MSAL | **MSAL only** (Microsoft Entra ID) |
| Realtime | Supabase Realtime subscriptions | Polling, SignalR, or Server-Sent Events |
| Storage | Supabase Storage | Azure Blob Storage |
| API pattern | Client-side SDK calls | REST API through Azure Functions |
| Connection | Public endpoint with row-level security | Private endpoint with Managed Identity |

> **Migration note:** Remove all `@supabase/supabase-js` imports and `supabase.ts` files from existing projects. Replace with the `api.ts` pattern above.

---

## Audit Log (Changelog)

Every app that modifies data **must** include an audit log. The pattern is consistent.

### Database Table (`changelog`)
```sql
CREATE TABLE dbo.changelog (
  id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  created_at    DATETIMEOFFSET   DEFAULT SYSDATETIMEOFFSET(),
  timestamp     NVARCHAR(100),
  user_email    NVARCHAR(255),
  project_id    INT,
  project_info  NVARCHAR(500),
  action        NVARCHAR(100),
  changes       NVARCHAR(MAX)
);

CREATE INDEX IX_changelog_project ON dbo.changelog (project_id);
CREATE INDEX IX_changelog_created ON dbo.changelog (created_at DESC);
```

### TypeScript Type
```ts
interface ChangeLogEntry {
  id: string;
  created_at: string;
  timestamp: string;
  userEmail: string;
  projectId: number;
  projectInfo: string;
  action: string;
  changes: string;
}
```

### Writing a Log Entry (via API)
```ts
// In your Azure Function handler
await pool.request()
  .input('timestamp', sql.NVarChar, new Date().toLocaleString())
  .input('user_email', sql.NVarChar, userEmail)
  .input('project_id', sql.Int, projectId)
  .input('project_info', sql.NVarChar, `${entity.name}`)
  .input('action', sql.NVarChar, 'Updated Record')
  .input('changes', sql.NVarChar, diffs.join(' | '))
  .query(`
    INSERT INTO dbo.changelog (timestamp, user_email, project_id, project_info, action, changes)
    VALUES (@timestamp, @user_email, @project_id, @project_info, @action, @changes)
  `);
```

> **IMPORTANT:** Always use parameterized queries with `.input()` — never string-interpolate user values into SQL. This prevents SQL injection.

### Audit Log View UI
```tsx
{viewMode === 'changelog' && (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="px-6 py-4 font-bold text-slate-600">Timestamp</th>
          <th className="px-6 py-4 font-bold text-slate-600">User</th>
          <th className="px-6 py-4 font-bold text-slate-600">Record</th>
          <th className="px-6 py-4 font-bold text-slate-600">Action</th>
          <th className="px-6 py-4 font-bold text-slate-600">Details</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {changeLog.map(entry => (
          <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
            <td className="px-6 py-4 text-xs text-slate-500 font-mono">{entry.timestamp}</td>
            <td className="px-6 py-4 font-medium text-slate-800">{entry.userEmail}</td>
            <td className="px-6 py-4 text-slate-600">{entry.projectInfo}</td>
            <td className="px-6 py-4">
              <span className="px-2 py-0.5 bg-blue-50 text-mac-accent rounded text-[10px] font-bold uppercase">
                {entry.action}
              </span>
            </td>
            <td className="px-6 py-4 text-xs text-slate-500 italic max-w-xs truncate">{entry.changes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

---

## Dashboard Design Principles

Follow these enterprise dashboard conventions across all MAC Products apps:

### Inverted Pyramid Layout

Structure every dashboard page top-to-bottom:

1. **KPI Bar** — 3–5 stat cards showing top-line metrics. Scannable in under 3 seconds.
2. **Filters / Controls** — Date pickers, search, status filters. Sticky or inline above content.
3. **Primary Data View** — The main table, chart, or list. This is where users spend most time.
4. **Secondary Panels** — Detail drawers, drill-down charts, or supplementary info accessed on demand.

### Progressive Disclosure

- Default views show summary data. Detailed breakdowns are one click away (expand row, open drawer, navigate to detail page).
- Use overlays/modals for contextual detail rather than navigating away from the current page.
- Advanced filters and bulk actions should be hidden behind a "More" or "Advanced" toggle.

### Data Tables (Enterprise Pattern)

Tables are the primary data interface in most MAC Products apps. Follow these conventions:

```tsx
<table className="w-full text-left text-sm">
  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
    <tr>
      <th className="px-4 py-3 font-bold text-slate-600 text-xs uppercase tracking-wide">Column</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-slate-100">
    <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer">
      <td className="px-4 py-3">...</td>
    </tr>
  </tbody>
</table>
```

Table requirements:
- **Sticky headers** for scrollable tables (`sticky top-0`)
- **Sortable columns** — clicking a header sorts asc/desc. Show a chevron indicator.
- **Row hover** — subtle highlight (`hover:bg-slate-50/50`)
- **Clickable rows** — clicking a row opens a detail view or drawer
- **Empty state** — always show a clear message when no data matches filters
- **Loading state** — show skeleton rows or a spinner while fetching
- **Pagination or virtual scroll** for datasets over 50 rows

### Keyboard Navigation

Enterprise users work faster with keyboards. Every app should support:

- **`/` or `Cmd+K`** — Focus the search/filter input (command palette pattern)
- **`Escape`** — Close modals, drawers, and dropdowns
- **`Tab`** — Navigate between interactive elements with visible focus rings
- **`Enter`** — Activate the focused element
- **Arrow keys** — Navigate within tables and lists

### Empty & Error States

Never show a blank page. Always provide:
- **Empty state**: Icon + message + primary action (e.g., "No projects yet. Create your first project.")
- **Error state**: Clear error message + retry button
- **Loading state**: Skeleton screens preferred over spinners for layout stability

---

## Cards & Content Panels

### Standard Data Card
```tsx
<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
  <div className="px-5 py-4 border-b bg-slate-50 flex justify-between items-center">
    <h3 className="font-bold text-slate-700 text-sm">Section Title</h3>
    {/* Optional action button */}
  </div>
  {/* Card content */}
</div>
```

### Stat Cards (Dashboard KPIs)
```tsx
<div className="bg-white p-5 rounded-xl border-l-4 border-l-red-500 shadow-sm">
  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Label</div>
  <div className="text-3xl font-bold text-slate-800 mt-1">{count}</div>
  <div className="text-xs text-slate-500 mt-1">{delta} from last period</div>
</div>
```

Use `border-l-red-500` / `border-l-mac-accent` / `border-l-green-500` / `border-l-slate-300` for Critical / Active / Success / Neutral.

**KPI card best practices:**
- Always show a **delta or trend** ("+12% vs last month", "↑ 3 from yesterday") when data supports it
- Use `font-mono` for the numeric value when precision matters
- Group 3–5 KPI cards in a responsive grid: `grid grid-cols-2 lg:grid-cols-4 gap-4`

### Status Badge
```tsx
<span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
  status === 'Critical' ? 'bg-red-50 text-red-600 border-red-200' :
  status === 'Warning'  ? 'bg-orange-50 text-orange-600 border-orange-200' :
  status === 'Success'  ? 'bg-green-50 text-green-600 border-green-200' :
                          'bg-blue-50 text-blue-600 border-blue-200'
}`}>{status}</span>
```

---

## Buttons

```tsx
// Primary (dark navy)
<button className="px-4 py-2 bg-mac-navy hover:bg-mac-blue text-white font-bold rounded-lg text-sm transition-all shadow-sm">
  Action
</button>

// Secondary (outline)
<button className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all">
  Cancel
</button>

// Danger
<button className="px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all">
  Delete
</button>

// Accent (interactive highlight)
<button className="px-4 py-2 text-sm font-bold text-white bg-mac-accent hover:bg-mac-blue rounded-lg shadow-sm transition-all">
  Save Changes
</button>

// Ghost (minimal)
<button className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
  More
</button>
```

**Button rules:**
- Every destructive action (Delete, Remove, Revoke) requires a **confirmation dialog** before executing.
- Primary actions should be visually distinct — only one primary button per section.
- Use `disabled:opacity-50 disabled:cursor-not-allowed` for disabled states.

---

## Form Inputs

```tsx
// Standard input
<input className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none transition-all" />

// Select
<select className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none bg-white transition-all" />

// Textarea
<textarea className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none resize-none transition-all" />

// Field Label
<label className="block text-xs font-bold text-slate-500 uppercase mb-2">Field Name</label>

// Error state
<input className="... border-red-300 focus:border-red-500 focus:ring-red-200" />
<p className="text-xs text-red-500 mt-1">This field is required</p>
```

**Form best practices:**
- Validate inline as the user types (debounced) — don't wait for submit.
- Show error messages directly below the field, not in a toast.
- Auto-focus the first field when a form/modal opens.
- Support `Enter` to submit forms.

---

## Modals & Drawers

### Modal
```tsx
// Overlay
<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
  // Modal panel
  <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
    // Sticky header
    <div className="sticky top-0 bg-mac-navy text-white px-6 py-4 rounded-t-xl z-10">
      <h2 className="text-xl font-bold">Modal Title</h2>
      <p className="text-blue-200 text-sm">Subtitle or context</p>
    </div>
    // Content
    <div className="p-6 space-y-5">
      {/* form fields */}
    </div>
    // Footer actions
    <div className="sticky bottom-0 p-4 border-t bg-slate-50 flex justify-between rounded-b-xl">
      <button>Destructive Action</button>
      <div className="flex gap-2">
        <button>Cancel</button>
        <button>Save</button>
      </div>
    </div>
  </div>
</div>
```

### Detail Drawer (Side Panel)

For record detail views, use a slide-in drawer instead of navigating to a new page:

```tsx
<div className={`fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-40 transform transition-transform duration-300 ${
  open ? 'translate-x-0' : 'translate-x-full'
}`}>
  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
    <h2 className="font-bold text-lg text-slate-800">Record Detail</h2>
    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
  </div>
  <div className="p-6 overflow-y-auto h-[calc(100vh-65px)]">
    {/* Detail content */}
  </div>
</div>
```

**Modal & Drawer rules:**
- Always close on `Escape` key press
- Always close when clicking the backdrop overlay
- Trap focus inside the modal while open (accessibility)
- Prevent body scroll when modal/drawer is open

---

## Toast Notifications

Use a self-dismissing Toast component (4 second auto-close):

```tsx
interface ToastProps {
  message: string;
  type: 'success' | 'warning' | 'error';
  onClose: () => void;
}

// Placement: fixed bottom-6 right-6 z-[100]
// Colors: bg-green-600 / bg-yellow-500 / bg-red-600
// Include a close button (✕) for manual dismiss
// Stack multiple toasts vertically with gap-2
```

---

## Search & Filtering

### Global Search

Every app with more than one data type should include a global search accessible via `Cmd+K` (Mac) / `Ctrl+K` (Windows):

```tsx
// Command palette overlay
<div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[20vh] backdrop-blur-sm">
  <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
    <input
      autoFocus
      placeholder="Search projects, users, records..."
      className="w-full px-6 py-4 text-lg border-b border-slate-200 outline-none"
    />
    <div className="max-h-80 overflow-y-auto">
      {/* Search results grouped by type */}
    </div>
  </div>
</div>
```

### Inline Filters

For table/list filtering, use a horizontal filter bar above the data:

```tsx
<div className="flex items-center gap-3 mb-4 flex-wrap">
  <input placeholder="Search..." className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-64" />
  <select className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
    <option>All Statuses</option>
  </select>
  {activeFilterCount > 0 && (
    <button onClick={clearFilters} className="text-xs text-mac-accent hover:underline">
      Clear filters ({activeFilterCount})
    </button>
  )}
</div>
```

---

## Animations & Transitions

```css
/* Page/view transitions — apply to every view container */
.view-transition {
  animation: fadeSlide 0.3s ease-out;
}

@keyframes fadeSlide {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Always add `className="... view-transition"` to the top-level div of each view/page.

### Animation Rules

- **Meaningful motion only** — animate transitions that help users understand spatial relationships (page changes, modal open/close, drawer slide). Don't animate decoratively.
- **Fast transitions** — keep all animations under 300ms. Users perceive >400ms as sluggish.
- **Reduce motion** — respect `prefers-reduced-motion` for accessibility:

```css
@media (prefers-reduced-motion: reduce) {
  .view-transition { animation: none; }
  * { transition-duration: 0.01ms !important; }
}
```

---

## Accessibility (A11y)

All MAC Products apps must meet **WCAG AA** standards:

- **Color contrast**: Minimum 4.5:1 for body text, 3:1 for large text and UI components
- **Focus indicators**: Never hide focus rings. Use `focus-visible:ring-2 focus-visible:ring-mac-accent` on all interactive elements
- **Semantic HTML**: Use `<nav>`, `<main>`, `<header>`, `<table>` with proper `<thead>` / `<th scope>` attributes
- **ARIA labels**: Add `aria-label` to icon-only buttons, `aria-live="polite"` to toast containers, `role="dialog"` to modals
- **Keyboard navigation**: All functionality must be operable without a mouse
- **Screen reader support**: Tables must have proper header associations. Charts must have text summaries.

---

## Tech Stack (Standard)

| Concern        | Library / Service               | Notes |
|----------------|--------------------------------|-------|
| Framework      | React 19 + TypeScript          | |
| Build tool     | Vite                           | |
| Styling        | Tailwind CSS (CDN or installed)| |
| Auth           | `@azure/msal-browser` + `@azure/msal-react` | Microsoft Entra ID SSO |
| Database       | **Azure SQL Database**         | Accessed via Azure Functions API — **never direct from frontend** |
| API layer      | **Azure Functions (Node.js/TS)** or SWA Database Connections | `mssql` package for direct queries |
| Storage        | **Azure Blob Storage**         | For file uploads, images, documents |
| Fonts          | DM Sans + Space Mono (Google Fonts) | |
| Deployment     | Azure Static Web Apps (CI/CD via GitHub Actions) | |
| Monitoring     | Azure Application Insights (optional) | For production error tracking |

### npm Dependencies (API layer)

```json
{
  "dependencies": {
    "mssql": "^11.0.0",
    "@azure/functions": "^4.0.0",
    "@azure/identity": "^4.0.0"
  }
}
```

### npm Dependencies (Frontend)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@azure/msal-browser": "^3.0.0",
    "@azure/msal-react": "^2.0.0"
  }
}
```

---

## Project File Structure

```
/
├── index.html              # Tailwind CDN config, fonts, meta
├── src/
│   ├── index.tsx           # MSAL init + ReactDOM.createRoot
│   ├── App.tsx             # Main layout, routing, state
│   ├── authConfig.ts       # MSAL config + allowed domain
│   ├── api.ts              # API client (fetch wrapper for Azure Functions)
│   ├── types.ts            # Shared TypeScript types
│   ├── constants.tsx        # Icons (SVG), seed data, enums
│   ├── index.css           # Global styles, sidebar, animations
│   ├── components/
│   │   ├── Login.tsx       # Microsoft SSO login screen
│   │   ├── Toast.tsx       # Notification toast
│   │   ├── CommandPalette.tsx  # Cmd+K search overlay
│   │   ├── EmptyState.tsx  # Reusable empty state component
│   │   └── ...             # Feature-specific components
│   └── hooks/
│       ├── useApi.ts       # Data fetching hook (loading/error/data pattern)
│       └── useKeyboard.ts  # Keyboard shortcut hook
├── api/                    # Azure Functions backend
│   ├── src/
│   │   ├── db.ts           # Azure SQL connection pool
│   │   └── functions/      # Individual function handlers
│   ├── package.json
│   └── host.json
├── swa-db-connections/     # (Optional) Data API builder config
│   └── staticwebapp.database.config.json
└── .github/
    └── workflows/
        └── azure-static-web-apps-*.yml
```

---

## Logo Usage

- Always use `/mac_logo.png` from the `public/` folder
- Sidebar: `w-10 h-10 object-contain`
- Login screen: `w-16 h-16 object-contain`
- Loading screen: `w-16 h-16 object-contain animate-pulse`
- Favicon: `<link rel="icon" type="image/png" href="/mac_logo.png">`

---

## Loading Screen

```tsx
if (loading) {
  return (
    <div className="flex h-screen items-center justify-center bg-mac-light">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4">
          <img src="/mac_logo.png" alt="MAC Logo" className="w-full h-full object-contain animate-pulse" />
        </div>
        <p className="text-slate-600 font-medium">Loading...</p>
      </div>
    </div>
  );
}
```

### Skeleton Screens (Preferred for data loading)

Use skeleton placeholders instead of spinners when loading data within a page:

```tsx
// Skeleton row for tables
<tr className="animate-pulse">
  <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24" /></td>
  <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32" /></td>
  <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16" /></td>
</tr>

// Skeleton card
<div className="bg-white p-5 rounded-xl border border-slate-200 animate-pulse">
  <div className="h-3 bg-slate-200 rounded w-20 mb-3" />
  <div className="h-8 bg-slate-200 rounded w-16" />
</div>
```

---

## Azure Static Web Apps Deployment

> **AI INSTRUCTION — Cannot Create Azure Resources:**
> The AI assistant **cannot** create the Azure Static Web App resource, link it to GitHub, or generate the deployment token. When scaffolding a new app, the AI should:
> 1. Generate the GitHub Actions workflow YAML with the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret placeholder.
> 2. **Explain to the user** how to create the Static Web App:
>    - Azure Portal → Static Web Apps → Create → choose a name, the MAC Products subscription, and resource group.
>    - Under **Deployment details**, select "GitHub" as the source, authorize Azure to access the MAC Products GitHub org, and select the repo and branch.
>    - Azure will auto-generate the GitHub Actions workflow file — the user can either use that or replace it with the standard template below.
>    - Set **Build Presets** to "Custom", with App location: `/`, API location: `api`, Output location: `dist`.
>    - After creation, go to the SWA resource → **Manage deployment token** → copy the token.
>    - In the GitHub repo → Settings → Secrets and variables → Actions → create a secret named `AZURE_STATIC_WEB_APPS_API_TOKEN` and paste the token.
> 3. If the app uses Database Connections (Data API builder), explain that the user must go to SWA resource → **Database connection** → link it to the Azure SQL Database.
> 4. Remind the user to add the SWA's auto-generated URL as a **Redirect URI** in the Entra ID App Registration (SPA type) for auth to work.

Every project should have `.github/workflows/azure-static-web-apps-*.yml`:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [main]

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: "upload"
          app_location: "/"
          api_location: "api"
          output_location: "dist"
```

---

## Security Best Practices

- **Never expose database credentials in frontend code.** All Azure SQL access goes through the API layer.
- **Use Managed Identity** for Azure Functions → Azure SQL connections in production. Connection strings with passwords are for local development only.
- **Validate all inputs server-side.** Frontend validation is for UX — the API must enforce constraints.
- **Use parameterized queries** (`pool.request().input(...)`) — never concatenate user input into SQL strings.
- **Enforce domain restriction** — only `@macproducts.net` emails can authenticate.
- **HTTPS everywhere** — Azure Static Web Apps and Azure Functions enforce TLS by default.
- **Store secrets in Azure Key Vault** or App Settings — never commit them to source control.

---

## Checklist for Every New MAC Products App

### Foundation
- [ ] Tailwind config includes `mac.*` color tokens
- [ ] DM Sans + Space Mono fonts loaded
- [ ] `/mac_logo.png` in `public/`
- [ ] `bg-mac-light` app background

### Authentication
- [ ] `authConfig.ts` with correct `clientId`, `tenantId`, and `ALLOWED_DOMAIN = "macproducts.net"`
- [ ] MSAL redirect login with domain enforcement
- [ ] Login screen follows standard template

### Layout & Navigation
- [ ] Sidebar with gradient, logo, nav items, sign-out, collapse toggle
- [ ] Breadcrumbs for apps with 3+ depth levels
- [ ] `view-transition` animation class on all page containers
- [ ] Responsive behavior (sidebar collapse on narrow viewports)

### Data Layer
- [ ] **Azure SQL Database** — tables created with proper indexes
- [ ] **Azure Functions API** — all database access through API, never direct from frontend
- [ ] `api.ts` client with proper error handling
- [ ] Parameterized queries only (no string interpolation in SQL)
- [ ] Loading states (skeleton screens) for all async data
- [ ] Empty states for all data views
- [ ] Error states with retry actions

### Audit & Observability
- [ ] Audit log (`changelog` table in Azure SQL) wired to all data mutations
- [ ] Audit log view in sidebar navigation
- [ ] All changelog writes include user email, action, and diff summary

### UX Quality
- [ ] Toast notification component for user feedback
- [ ] Confirmation dialogs for all destructive actions
- [ ] Keyboard shortcut support (`Escape` to close, `Cmd+K` for search)
- [ ] Visible focus indicators on all interactive elements
- [ ] `prefers-reduced-motion` respected

### Deployment
- [ ] Azure Static Web Apps GitHub Action configured with `api_location`
- [ ] Environment variables set in Azure App Settings (not committed to repo)
- [ ] Version tag `font-mono` in app header (e.g., `V1.0.0`)
