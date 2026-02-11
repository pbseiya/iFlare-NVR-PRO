# Auto-Resume Sessions Implementation Plan

## Goal
Enable the system to automatically resume previously running sessions when the backend server restarts. This behavior should be configurable via the Settings page.

## User Review Required
> [!IMPORTANT]
> This change introduces a new database table `app_settings` and shifts the source of truth for some settings from Client (LocalStorage) to Server (PostgreSQL).

## Proposed Changes

### Database
#### [NEW] `app_settings` Table
- Create a key-value store or a single-row configuration table.
- Columns: `key` (primary key, varchar), `value` (jsonb/text), `description` (text).
- Initial record: `auto_resume` = `false` (default).

### Backend
#### [MODIFY] `backend/database.py`
- Add methods: `get_app_setting(key)`, `set_app_setting(key, value)`.
- Add `get_active_sessions_at_shutdown()` helper (optional, or just reuse `list_sessions(status='running')` if status wasn't updated to 'stopped').
  - *Note:* Currently, if server dies, status remains 'running'. We can use this to our advantage: on startup, find 'running' sessions.
  - If `auto_resume` is ON: Restart them.
  - If `auto_resume` is OFF: Mark them as 'stopped'.

#### [MODIFY] `backend/main.py`
- Add API endpoints:
  - `GET /api/settings`: Fetch system settings.
  - `POST /api/settings`: Update system settings.
- Implement Startup Logic (`@asynccontextmanager` lifecyle):
  - Check `app_settings.auto_resume`.
  - Query sessions with `status='running'`.
  - Action based on setting.

### Frontend
#### [MODIFY] `web-config/lib/api.ts`
- Add `getSystemSettings` and `updateSystemSettings` methods.

#### [MODIFY] `web-config/components/SettingsContext.tsx`
- Integrate with new API endpoints.
- Sync `auto_resume` state with backend.

#### [MODIFY] `web-config/app/settings/page.tsx`
- Add a new "System" section.
- Add "Auto-Resume Live Sessions on Startup" toggle.

## Verification Plan

### Automated Tests
- None planned for this phase (manual verification preferred for system lifecycle).

### Manual Verification
1.  **Default Behavior:**
    - Ensure `auto_resume` is OFF by default.
    - Start a session -> Kill Backend -> Start Backend.
    - Session should be `stopped`.
2.  **Enable Auto-Resume:**
    - Go to Settings -> Enable "Auto-Resume".
    - Start a session -> Kill Backend -> Start Backend.
    - Session should automatically return to `running`.
    - Check logs for "Resuming session #ID..." messages.
