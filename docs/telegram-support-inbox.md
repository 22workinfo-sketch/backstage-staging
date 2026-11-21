# Telegram support inbox

Customers send private messages to the support bot they already know. Staff sign in to Botdek and use **Support inbox**. The web app on Hostinger and the VPS worker use the same PostgreSQL database. Each bot starts with its inbox disabled.

## Set up on staging

1. Choose a separate staging bot token and the staging database. Check out the same revision for the web app and VPS. Apply the included migration with `npx prisma migrate deploy` against that database, then run `npx prisma generate` before building the web app.
2. Register the staging bot in **Bots**. Open **Support inbox**, select the bot, and choose **Enable support inbox**. This routes its private messages to staff. An agent with a personal Telegram account can contact it just like any other customer.
3. As a super admin, open **Users & access**, create or edit a staff account, choose **Support Agent**, and select the staging bot. After the first password change the agent lands in the inbox. An assigned admin can also use that bot's inbox. Super admins can enable inboxes and manage staff assignments.
4. Run the existing VPS worker using `docker compose -f docker-compose.bot.yml up -d --build`, or `npm run bot` for local testing. In polling mode, restart the worker after registering a new bot. In webhook mode the web app receives updates and the worker delivers replies. For an explicitly configured webhook update filter, include both `message` and `edited_message`.
5. From a customer account send a private message to the staging bot. Open the conversation as an assigned agent and reply with Burmese text, emoji and an address containing an underscore. Try a reply longer than 4,096 characters. Check the parts in Telegram and the delivery status in Botdek. Reload the inbox or disconnect and reconnect the browser to check the saved history.

## Work a conversation

Use **Claim** or send the first reply to take an open conversation. **Mine** shows your own open conversations. Use **Release** to hand the chat back to the team. An assigned admin or a super admin can take over. **Resolve** moves it to the resolved list. A new customer message reopens the conversation.

Staff replies use plain text. Botdek saves a reply before the worker sends its parts and records each acknowledged part. **Sent to Telegram** means the Bot API accepted the reply. If the worker loses the acknowledgement, **Delivery unconfirmed** leaves the decision with staff. Check with the customer before using **Retry remaining**. **Stop remainder** lets later replies proceed. Customer attachments can be downloaded through the authorized chat subject to Telegram's cloud file limit.

## Switch the existing support bot

Keep the current tawk.to integration serving customers during staging. When staging passes and you choose the cutover time, deploy the migration to the intended production database and the same code to Hostinger and the VPS. With both sides ready, disconnect the support bot from tawk.to, enable its Botdek inbox and start the selected receiver. For polling the runner checks for an existing webhook and waits for operator action if one is still present. Restart it after disconnecting the old receiver. Avoid dropping pending updates.

The Botdek conversation history starts with updates it receives. Existing tawk.to transcripts stay in tawk.to. Telegram retains outstanding updates for up to 24 hours. Staff can retrieve older messages that Botdek has already stored using **Older messages**.

[Telegram update delivery](https://core.telegram.org/bots/api#getting-updates) · [Telegram text messages](https://core.telegram.org/bots/api#sendmessage) · [Telegram file downloads](https://core.telegram.org/bots/api#getfile)
