# Telegram Bot Backstage — Local Windows Run Guide

Follow these exact steps to run and test your Telegram Bot Backstage on Windows.

---

## 1. Prerequisites Check
Ensure Docker Desktop is running in your Windows taskbar.

---

## 2. Windows PowerShell Script Fix (One-time)
If PowerShell shows an error about script execution (`npm.ps1 cannot be loaded`), open Windows PowerShell and run:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
*(Or alternatively, invoke commands with `npm.cmd`)*

---

## 3. Starting the Local PostgreSQL Database
In the root `BackStage` directory:
```powershell
docker compose up -d
```
To verify PostgreSQL is running and healthy:
```powershell
docker ps --filter "name=backstage-pg"
```
*(PostgreSQL is strictly bound to `127.0.0.1:5432`)*

---

## 4. Setting Your Local Admin Password Privately
The database is initially seeded with default test credentials (`admin@local.test` / `change_me_local_password_123`).

To replace this with your own private password **without revealing it in chat or modifying other database tables**:
```powershell
$env:NEW_ADMIN_PASSWORD="YourPrivatePasswordHere"
npm.cmd run admin:password
Remove-Item Env:NEW_ADMIN_PASSWORD
```
This script:
- Hashes your chosen password with bcrypt (12 salt rounds).
- Updates ONLY the `admin_users` record in PostgreSQL.
- Leaves your bot configuration, welcome message, menu buttons, and user profiles untouched.
- Immediately removes the variable from PowerShell memory so it is not stored.

---

## 5. Starting the Services

### Terminal 1: Admin Web Interface (Next.js)
```powershell
npm.cmd run dev
```
*(The web server is restricted to `127.0.0.1:3000` via `-H 127.0.0.1` and will not accept traffic from external LAN devices)*

Open your browser to:
- **Admin Panel**: [http://127.0.0.1:3000](http://127.0.0.1:3000) (or [http://localhost:3000](http://localhost:3000))
- **Health Check**: [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)

Log in using your admin email and the password you set in Step 4.

---

### Terminal 2: Telegram Bot Service (Long Polling)

#### Step A: Configure your Test Bot Token
1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Create a test bot using the `/newbot` command.
3. Copy the token provided by BotFather (e.g. `123456789:ABCdef...`).
4. Open your local `.env` file in the root `BackStage` directory with Notepad and insert your token:
   ```env
   TELEGRAM_BOT_TOKEN="your_actual_token_from_botfather"
   ```
   *(Important: Never paste this token in public chats or commit the `.env` file!)*

#### Step B: Start the Bot Runner
In a second PowerShell window:
```powershell
npm.cmd run bot
```
The console will display:
```text
[Bot Runner] Initializing Telegram bot long polling...
[Bot Runner] Long polling active for @your_test_bot
[Bot Runner] Ready to receive Telegram messages. Press Ctrl+C to stop.
```

---

## 6. Using the Bot Menu Builder in Backstage

You can manage your Telegram bot's reply keyboard directly from the web panel:

1. In the Admin Dashboard, click **Manage Bot →** on your test bot (`/bots/[id]`).
2. Scroll to the **Bot Menu Builder (Reply Keyboard)** section.
3. **Add a Button**:
   - Click **+ Add Button**.
   - Enter a label (e.g. `🕒 Working Hours` or `📍 Office Location`, max 64 chars).
   - Select an **Action Type**:
     - **Send Text Reply (`SEND_TEXT`)**: Enter the text message the bot will send when the button is tapped (max 2000 chars).
       - **Auto-Delete Bot Reply (Optional)**: Check this toggle to automatically delete the bot's reply message after a delay.
       - **Delete After (Seconds)**: Set the delay in seconds (between 5 and 86,400 seconds / up to 24h). Default is 30s.
     - **Request Contact (`REQUEST_CONTACT`)**: Telegram's phone-sharing button with built-in ownership validation.
   - Click **Add to Menu**.
4. **Edit a Button**: Click **Edit** on any button to change its label, reply text, or auto-delete configuration.
5. **Enable / Disable**: Click **Disable** to temporarily hide a button from the keyboard without deleting it.
6. **Reorder**: Use the **▲ (Move Up)** and **▼ (Move Down)** controls to adjust button ordering.
7. **Preview**: Check the **Telegram User Keyboard Preview** box to see how the keyboard will appear to users in order.
8. **Delete with Confirmation**: Click **Delete**, then confirm with **Yes, Delete**.
9. **Save Changes**: Click **Save Menu Changes** at the bottom to write the updated menu to PostgreSQL.

---

## 7. How to Test the MVP Flow End-to-End

> [!IMPORTANT]
> - Use **only your own test Telegram account** and test phone number for local verification.
> - When taking screenshots or reporting results, **mask or blur any phone numbers**.

1. **Send `/start` to your bot**:
   - The bot replies with the dynamic welcome greeting loaded from PostgreSQL.
   - It displays a clear note explaining that phone sharing is **optional** and used only by backstage staff for support.
   - The dynamic reply keyboard appears with all your configured enabled buttons.
2. **Test `SEND_TEXT` Buttons**:
   - Tap any text button (e.g. `ℹ️ Help / Info` or your newly created button).
   - The bot immediately replies with the configured response from the database!
3. **Test Auto-Delete Reply Flow**:
   - In the Admin Panel, create or edit a `SEND_TEXT` button (e.g. `⏳ Temporary Promo`).
   - Enable **Auto-Delete Bot Reply** and set delay to `10` seconds. Click **Save Menu Changes**.
   - In Telegram, tap `⏳ Temporary Promo`.
   - The bot immediately sends the promo text.
   - Wait 10 seconds: the bot's reply message disappears from the chat!
   - Notice that your user button tap, welcome message, and other messages **remain completely untouched**.
4. **Test Worker Crash Resilience & Restart**:
   - Configure a button with auto-delete delay of `30` seconds.
   - Tap the button in Telegram.
   - Immediately stop the bot runner in PowerShell (`Ctrl+C`).
   - Wait 35 seconds, then restart the bot runner (`npm.cmd run bot`).
   - The background sweeper detects the due job in PostgreSQL upon startup and deletes the message from Telegram!
5. **Test `REQUEST_CONTACT` Button**:
   - Tap `📱 Share Phone Number`.
   - Telegram sends your verified contact (`contact.user_id === your_id`).
   - The bot verifies ownership and replies:
     `✅ Thank you! Your phone number has been verified and securely recorded for support purposes in Backstage.`
6. **Test Contact Ownership Rejection**:
   - If you forward a third-party contact card, the bot detects the mismatch and politely rejects it:
     `⚠️ We could not verify this phone number. To protect your account, we only accept your own personal contact...`
   - Your existing verified phone number is preserved in the database.
7. **Inspect in Admin Panel**:
   - In your browser, open `http://127.0.0.1:3000/bots/00000000-0000-0000-0000-000000000001`.
   - The user table shows your `telegram_id`, name, `@username`, and verified phone number.
8. **Test Live Menu Updates**:
   - In the Admin Panel, add a new button (e.g. `🎁 Bonus Info`) and click **Save Menu Changes**.
   - In Telegram, send `/start`.
   - Telegram immediately updates your keyboard to show the new button.
   - Tap `🎁 Bonus Info` to verify the bot sends your new reply text!

---

## 8. Running Automated Tests
Run the 41 automated unit and integration tests anytime:
```powershell
npm.cmd test
```
- Tests for bcrypt hashing, jose JWT sessions, and mock request guards run using **in-memory mocks**.
- Tests for health check, user upsert, contact persistence, greeting updates, menu CRUD, auto-delete scheduling, atomic sweeper claiming, error resilience, and cross-bot isolation run against **real local PostgreSQL**.

---

## 9. Current Limitations & Scope
- **Single-Admin MVP**: Admin-to-bot granular authorization is not yet implemented. Any authenticated admin can manage the bot menu.
- **Reply Keyboard Only**: Buttons appear as a native Telegram chat keyboard (one per row). Inline keyboards and Telegram Mini Apps are not included in this phase.
- **Client Caching in Telegram**: Telegram caches reply keyboards locally on the client until the bot sends a message with an updated `reply_markup` (such as on `/start`).
- **Telegram API Deletion Limits**: Telegram allows deleting bot messages up to 48 hours after sending. Older messages return `message can't be deleted`; our sweeper safely marks these as `FAILED` rather than retrying indefinitely.
- **Crash Window Between Send & Schedule**: When the bot sends a message, there is a sub-millisecond window between Telegram acknowledging the sent message and PostgreSQL writing the `scheduled_deletions` record. If the node process crashes during that exact instant, the message would remain in Telegram without a scheduled deletion entry.
- **Already-Deleted Handling**: If a user or admin manually deletes the message before the auto-delete timer expires, Telegram returns `message to delete not found`, which our sweeper safely detects and records as `COMPLETED`.
