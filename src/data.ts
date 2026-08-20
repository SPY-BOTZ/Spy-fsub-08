export const botCode = `import os
import asyncio
import logging
from datetime import datetime, timedelta
import aiosqlite
from pyrogram import Client, filters, idle
from pyrogram.types import ChatPermissions, ChatMemberUpdated
from pyrogram.enums import ChatMemberStatus
from aiohttp import web

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Environment Variables (Koyeb injects PORT automatically)
API_ID = os.environ.get("API_ID")
API_HASH = os.environ.get("API_HASH")
BOT_TOKEN = os.environ.get("BOT_TOKEN")
BOT_OWNER_ID = int(os.environ.get("BOT_OWNER_ID", 0))
PORT = int(os.environ.get("PORT", 8000))

if not all([API_ID, API_HASH, BOT_TOKEN]):
    logger.error("Error: API_ID, API_HASH, and BOT_TOKEN environment variables must be set.")
    exit(1)

# Initialize Pyrogram Client
app = Client(
    "group_manager_bot",
    api_id=API_ID,
    api_hash=API_HASH,
    bot_token=BOT_TOKEN
)

DB_FILE = "bot_data.db"

async def init_db():
    """Initialize the SQLite database for tracking user messages and invites."""
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id INTEGER PRIMARY KEY,
                msg_count INTEGER,
                last_msg_date TEXT,
                invited_count INTEGER DEFAULT 0
            )
        """)
        # Safe migration if table exists without invited_count
        try:
            await db.execute("ALTER TABLE user_stats ADD COLUMN invited_count INTEGER DEFAULT 0")
        except Exception:
            pass # Column already exists
            
        await db.execute("""
            CREATE TABLE IF NOT EXISTS group_settings (
                chat_id INTEGER PRIMARY KEY,
                daily_limit INTEGER DEFAULT 4
            )
        """)
        try:
            await db.execute("ALTER TABLE group_settings ADD COLUMN welcome_message TEXT")
        except Exception:
            pass # Column already exists
            
        await db.execute("""
            CREATE TABLE IF NOT EXISTS known_groups (
                chat_id INTEGER PRIMARY KEY
            )
        """)
        await db.commit()

@app.on_message(filters.command("invite") & filters.group)
async def generate_invite(client, message):
    """Generate a unique referral link for the user."""
    user_id = message.from_user.id
    chat_id = message.chat.id
    try:
        # Create a unique link tied to the user
        link = await client.create_chat_invite_link(chat_id, name=f"invite_{user_id}")
        await message.reply_text(
            f"Here is your unique referral link:\\n{link.invite_link}\\n\\n"
            f"Share this with 2 friends to unlock unlimited movie searches!"
        )
    except Exception as e:
        logger.error(f"Invite link error: {e}")
        await message.reply_text("Error generating link. Ensure I have 'Invite Users' admin rights.")

@app.on_message(filters.command("setlimit") & filters.group)
async def set_group_limit(client, message):
    """Admin command to set daily message limit dynamically without restarting."""
    user_id = message.from_user.id
    chat_id = message.chat.id
    
    # Check if user is an admin or creator
    member = await client.get_chat_member(chat_id, user_id)
    if member.status not in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
        await message.reply_text("Only group admins can use this command.")
        return
        
    try:
        new_limit = int(message.command[1])
        if new_limit < 1:
            raise ValueError
    except (IndexError, ValueError):
        await message.reply_text("Please provide a valid number. Usage: /setlimit 5")
        return
        
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute(
            "INSERT INTO group_settings (chat_id, daily_limit) VALUES (?, ?) "
            "ON CONFLICT(chat_id) DO UPDATE SET daily_limit=excluded.daily_limit",
            (chat_id, new_limit)
        )
        await db.commit()
        
    await message.reply_text(f"✅ Daily search limit has been updated to {new_limit} messages for this group.")

@app.on_message(filters.command("setwelcome") & filters.group)
async def set_welcome_message(client, message):
    """Admin command to set a custom welcome message for the group."""
    user_id = message.from_user.id
    chat_id = message.chat.id
    
    # Check if user is an admin or creator
    member = await client.get_chat_member(chat_id, user_id)
    if member.status not in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
        await message.reply_text("Only group admins can use this command.")
        return
        
    if len(message.command) < 2:
        await message.reply_text("Usage: /setwelcome <your message>\\nYou can use {user} in your message to tag the new member.")
        return
        
    welcome_text = message.text.split(None, 1)[1]
    
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute(
            "INSERT INTO group_settings (chat_id, welcome_message) VALUES (?, ?) "
            "ON CONFLICT(chat_id) DO UPDATE SET welcome_message=excluded.welcome_message",
            (chat_id, welcome_text)
        )
        await db.commit()
        
    await message.reply_text("✅ Welcome message has been successfully updated for this group.")

@app.on_message(filters.command("userstats") & filters.group)
async def get_user_stats(client, message):
    """Admin command to check a specific user's stats."""
    user_id = message.from_user.id
    chat_id = message.chat.id
    
    # Check if user is an admin or creator
    member = await client.get_chat_member(chat_id, user_id)
    if member.status not in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
        await message.reply_text("Only group admins can use this command.")
        return
        
    target_user_id = None
    if message.reply_to_message:
        target_user_id = message.reply_to_message.from_user.id
    elif len(message.command) > 1:
        try:
            target_user_id = int(message.command[1])
        except ValueError:
            await message.reply_text("Please provide a valid user ID.")
            return
    else:
        await message.reply_text("Usage: /userstats <user_id> or reply to a user's message.")
        return
        
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT msg_count, last_msg_date, invited_count FROM user_stats WHERE user_id = ?", (target_user_id,)) as cursor:
            row = await cursor.fetchone()
            
    if row:
        msg_count, last_msg_date, invited_count = row
    else:
        msg_count, last_msg_date, invited_count = (0, "Never", 0)
        
    # Get restriction status
    try:
        target_member = await client.get_chat_member(chat_id, target_user_id)
        if target_member.status == ChatMemberStatus.RESTRICTED and not target_member.permissions.can_send_messages:
            status_text = "🔴 Restricted (Muted)"
        elif target_member.status in [ChatMemberStatus.LEFT, ChatMemberStatus.BANNED]:
            status_text = "⚪ Not in group"
        else:
            status_text = "🟢 Active (Can Send Messages)"
    except Exception:
        status_text = "⚪ Unknown (User might have left)"

    stats_message = (
        f"📊 **User Stats for** \`{target_user_id}\`\\n\\n"
        f"**Messages Sent (Today):** {msg_count}\\n"
        f"**Last Message Date:** {last_msg_date}\\n"
        f"**Total Referrals:** {invited_count}\\n"
        f"**Current Status:** {status_text}"
    )
    
    await message.reply_text(stats_message)

@app.on_message(filters.command("topreferrers") & filters.group)
async def top_referrers(client, message):
    """Command to display the top 10 referrers."""
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT user_id, invited_count FROM user_stats WHERE invited_count > 0 ORDER BY invited_count DESC LIMIT 10") as cursor:
            rows = await cursor.fetchall()
            
    if not rows:
        await message.reply_text("No successful referrals recorded yet!")
        return
        
    leaderboard = "🏆 **Top 10 Referrers**\\n\\n"
    for i, (uid, count) in enumerate(rows, 1):
        leaderboard += f"**{i}.** \`{uid}\` - {count} invites\\n"
        
    await message.reply_text(leaderboard)

@app.on_message(filters.command("broadcast") & filters.user(BOT_OWNER_ID))
async def broadcast_message(client, message):
    """Admin command to broadcast a message to all known groups."""
    if len(message.command) < 2:
        await message.reply_text("Usage: /broadcast <your message here>")
        return
        
    broadcast_text = message.text.split(None, 1)[1]
    
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT chat_id FROM known_groups") as cursor:
            rows = await cursor.fetchall()
            
    if not rows:
        await message.reply_text("I don't know any groups yet!")
        return
        
    success = 0
    failed = 0
    
    await message.reply_text(f"Starting broadcast to {len(rows)} groups...")
    
    for row in rows:
        chat_id = row[0]
        try:
            await client.send_message(chat_id, broadcast_text)
            success += 1
            await asyncio.sleep(0.1) # Anti-flood delay
        except Exception as e:
            logger.error(f"Failed to broadcast to {chat_id}: {e}")
            failed += 1
                
    await message.reply_text(f"✅ Broadcast complete!\\nSuccess: {success}\\nFailed: {failed}")

@app.on_chat_member_updated(filters.group)
async def on_member_join(client, update: ChatMemberUpdated):
    """Handle new members: send welcome message and track referral invites."""
    new_member = update.new_chat_member
    old_member = update.old_chat_member
    
    # Check if this is a newly joined member
    is_new_join = (
        new_member and 
        new_member.status == ChatMemberStatus.MEMBER and 
        (not old_member or old_member.status in [ChatMemberStatus.LEFT, ChatMemberStatus.BANNED])
    )
    
    if not is_new_join:
        return
        
    chat_id = update.chat.id
    joined_user = new_member.user
    
    # Send Welcome Message if configured
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT welcome_message FROM group_settings WHERE chat_id = ?", (chat_id,)) as cursor:
            row = await cursor.fetchone()
            if row and row[0]:
                welcome_text = row[0]
                mention = joined_user.mention
                if "{user}" in welcome_text:
                    welcome_text = welcome_text.replace("{user}", mention)
                else:
                    welcome_text = f"Welcome {mention}!\\n\\n{welcome_text}"
                
                try:
                    await client.send_message(chat_id, welcome_text)
                except Exception as e:
                    logger.error(f"Failed to send welcome message in {chat_id}: {e}")
                    
    # Process Referral Tracking
    if update.invite_link and update.invite_link.creator:
        inviter_id = update.invite_link.creator.id
        joined_id = joined_user.id
        
        # Self-joins don't count
        if inviter_id == joined_id:
            return
            
        async with aiosqlite.connect(DB_FILE) as db:
            # Ensure inviter is in DB
            await db.execute(
                "INSERT OR IGNORE INTO user_stats (user_id, msg_count, last_msg_date, invited_count) VALUES (?, 0, '', 0)",
                (inviter_id,)
            )
            # Increment invite count
            await db.execute(
                "UPDATE user_stats SET invited_count = invited_count + 1 WHERE user_id = ?",
                (inviter_id,)
            )
            await db.commit()
            
            # Check if they hit the 2 member threshold to unlock unlimited
            async with db.execute("SELECT invited_count FROM user_stats WHERE user_id = ?", (inviter_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0] == 2:
                    # Lift any existing restriction
                    try:
                        await client.restrict_chat_member(
                            chat_id=chat_id,
                            user_id=inviter_id,
                            permissions=ChatPermissions(
                                can_send_messages=True,
                                can_send_media_messages=True,
                                can_send_other_messages=True,
                                can_add_web_page_previews=True
                            )
                        )
                        await client.send_message(
                            chat_id, 
                            f"🎉 Congratulations! <a href='tg://user?id={inviter_id}'>User</a> has invited 2 members and unlocked unlimited file searches!"
                        )
                    except Exception as e:
                        logger.error(f"Failed to un-restrict user {inviter_id}: {e}")

@app.on_message(filters.group & ~filters.bot & ~filters.command("invite"))
async def handle_group_message(client, message):
    """Track messages/searches and restrict if the limit is exceeded."""
    if not message.from_user:
        return
        
    user_id = message.from_user.id
    chat_id = message.chat.id
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    async with aiosqlite.connect(DB_FILE) as db:
        # Track that the bot is active in this group
        await db.execute("INSERT OR IGNORE INTO known_groups (chat_id) VALUES (?)", (chat_id,))
        
        # Fetch dynamic group limit
        async with db.execute("SELECT daily_limit FROM group_settings WHERE chat_id = ?", (chat_id,)) as cursor:
            row_limit = await cursor.fetchone()
            group_limit = row_limit[0] if row_limit else 4
            
        # Fetch current stats
        async with db.execute("SELECT msg_count, last_msg_date, invited_count FROM user_stats WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            
        if row:
            msg_count, last_msg_date, invited_count = row
            
            # BYPASS: If they have invited 2 or more members, they have unlimited searches
            if invited_count >= 2:
                return
                
            if last_msg_date != today_str:
                # New calendar day -> reset count to 1
                msg_count = 1
                last_msg_date = today_str
            else:
                # Same day -> increment count
                msg_count += 1
        else:
            # First time user is sending a message
            msg_count = 1
            last_msg_date = today_str
            invited_count = 0
            
        # Update DB with new count
        await db.execute(
            "INSERT OR REPLACE INTO user_stats (user_id, msg_count, last_msg_date, invited_count) VALUES (?, ?, ?, ?)",
            (user_id, msg_count, last_msg_date, invited_count)
        )
        await db.commit()
        
        # Restrict logic on the N+1 message (crossing the limit)
        if msg_count == group_limit + 1:
            warning_text = (
                f"Sir aapne phale hi {group_limit} file search ki hai. Unlimited lene se phale aapko "
                "is group pe 2 member add karna padega, tabhi aap is group pe movie file search kar sakte ho.\\n\\n"
                "Use /invite to get your personal referral link!"
            )
            
            # 1. Reply to the user's message
            try:
                await message.reply_text(warning_text)
            except Exception as e:
                logger.error(f"Could not send warning message: {e}")
            
            # 2. Mute/Restrict user for exactly 24 hours
            restrict_until = datetime.utcnow() + timedelta(days=1)
            try:
                await client.restrict_chat_member(
                    chat_id=chat_id,
                    user_id=user_id,
                    permissions=ChatPermissions(can_send_messages=False),
                    until_date=restrict_until
                )
                logger.info(f"Muted user {user_id} until {restrict_until} UTC.")
            except Exception as e:
                logger.error(f"Failed to mute user {user_id}. Ensure bot is admin with restrict rights: {e}")

# --- Dummy Web Server for Koyeb Health Checks ---
async def health_check(request):
    """Simple endpoint to tell Koyeb the service is healthy."""
    return web.Response(text="Telegram Bot is Running smoothly!", status=200)

async def start_web_server():
    """Starts a lightweight AIOHTTP web server in the background."""
    web_app = web.Application()
    web_app.router.add_get('/', health_check)
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    await site.start()
    logger.info(f"Dummy web server running on port {PORT} for Koyeb health checks.")

async def main():
    # Setup Database
    await init_db()
    
    # Start Koyeb Health Check Server
    await start_web_server()
    
    # Start the Pyrogram Bot
    await app.start()
    logger.info("Bot started successfully!")
    
    # Keep running until terminated
    await idle()
    
    # Graceful shutdown
    await app.stop()

if __name__ == "__main__":
    asyncio.run(main())
`;

export const reqCode = `pyrogram==2.0.106
TgCrypto==1.2.5
aiosqlite==0.20.0
aiohttp==3.9.5
`;

export const deployGuide = `### Deploying to Koyeb

This bot is configured to run flawlessly on Koyeb. Because Koyeb expects web services to bind to a port, the script includes a lightweight \`aiohttp\` server that runs alongside your Telegram bot to pass health checks.

#### 1. Setup GitHub Repository
Create a new private GitHub repository and upload two files into the root directory:
- \`main.py\` (The python bot code)
- \`requirements.txt\` (The dependencies list)

#### 2. Create Koyeb Service
1. Log into your Koyeb account and click **Create App**.
2. Select **GitHub** as the deployment method and choose your repository.
3. In the builder settings, select **Buildpacks**. Koyeb will automatically detect that it's a Python application based on \`requirements.txt\`.

#### 3. Configure Port & Run Command
1. Scroll down to the **Exposed Ports** section.
2. Ensure the port is set to **8000** and the path is \`/\`. (The dummy web server in the script listens on this port).
3. Under **Run Command**, override the default and enter:
   \`python main.py\`

#### 4. Add Environment Variables
Under the **Environment Variables** section, add your Telegram credentials:
- \`API_ID\`: Your Telegram API ID (get it from *my.telegram.org*)
- \`API_HASH\`: Your Telegram API Hash (get it from *my.telegram.org*)
- \`BOT_TOKEN\`: Your Bot Token (get it from *BotFather* on Telegram)
- \`BOT_OWNER_ID\`: Your personal Telegram User ID (for the /broadcast command)

*(Note: Koyeb automatically sets a \`PORT\` variable, which the script detects and uses automatically).*

#### 5. Deploy
Click **Deploy**. Koyeb will build the environment, install the requirements, and launch your bot. Ensure your bot is added to your Telegram group as an **Administrator** with the right to **Ban/Restrict Users** and **Invite Users via Link**.
`;

export const readmeCode = `# Telegram Group Manager Bot

A production-ready Telegram bot built with Python and Pyrogram. Designed to manage group activity, enforce message limits, and drive group growth through a referral system.

## 🚀 Core Features

*   **Message Limiting:** Restricts users from sending more than a set number of messages (default: 4) per calendar day.
*   **Referral System:** Users can unlock unlimited messages by inviting 2 new members using their unique referral link.
*   **Automated Restrictions:** Automatically mutes users for 24 hours if they exceed the limit without meeting the referral requirement.
*   **Custom Welcome Messages:** Greet new members dynamically with custom text.
*   **Persistent Storage:** Uses async SQLite (\`aiosqlite\`) so data is never lost during bot restarts.
*   **Koyeb Ready:** Includes a built-in lightweight web server to pass health checks on cloud platforms like Koyeb.

## 🤖 Bot Commands

### User Commands
*   \`/invite\` - Generates a unique, personalized referral link for the user to share.

### Admin Commands
*   \`/setlimit <number>\` - Dynamically change the daily message limit for the group without restarting the bot.
*   \`/setwelcome <message>\` - Set a custom welcome greeting for new joins. Use \`{user}\` to tag the newly joined member.
*   \`/userstats <user_id>\` - Check a specific user's message count, total referrals, and current restriction status. Can also be used by replying to a user's message.
*   \`/topreferrers\` - Displays a leaderboard of the top 10 users with the most successful referrals in the group.
*   \`/broadcast <message>\` - *(Bot Owner Only)* Broadcasts an announcement to all groups where the bot is currently active.

## 🛠️ Setup & Deployment

Please refer to the **Deployment Guide** tab in the UI for complete, step-by-step instructions on how to deploy this bot to Koyeb for free 24/7 hosting.

### Required Environment Variables
*   \`API_ID\`: Your Telegram API ID.
*   \`API_HASH\`: Your Telegram API Hash.
*   \`BOT_TOKEN\`: Your Telegram Bot Token.
*   \`BOT_OWNER_ID\`: Your personal Telegram User ID (required for the \`/broadcast\` command).
`;
