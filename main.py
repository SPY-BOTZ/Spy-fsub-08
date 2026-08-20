import os
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

# ==========================================
# ⚠️ API DETAILS YAHAN DALEN ⚠️
# ==========================================
API_ID = int(os.environ.get("API_ID", 12345678))
API_HASH = os.environ.get("API_HASH", "aapka_api_hash_yahan")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "aapka_bot_token_yahan")
BOT_OWNER_ID = int(os.environ.get("BOT_OWNER_ID", 123456789))
PORT = int(os.environ.get("PORT", 8000))
# ==========================================

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
    user_id = message.from_user.id
    chat_id = message.chat.id
    try:
        link = await client.create_chat_invite_link(chat_id, name=f"invite_{user_id}")
        await message.reply_text(
            f"Here is your unique referral link:\n{link.invite_link}\n\n"
            f"Share this with 2 friends to unlock unlimited movie searches!"
        )
    except Exception as e:
        logger.error(f"Invite link error: {e}")
        await message.reply_text("Error generating link. Ensure I have 'Invite Users' admin rights.")

@app.on_message(filters.command("setlimit") & filters.group)
async def set_group_limit(client, message):
    user_id = message.from_user.id
    chat_id = message.chat.id
    
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
    user_id = message.from_user.id
    chat_id = message.chat.id
    
    member = await client.get_chat_member(chat_id, user_id)
    if member.status not in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
        await message.reply_text("Only group admins can use this command.")
        return
        
    if len(message.command) < 2:
        await message.reply_text("Usage: /setwelcome <your message>")
        return
        
    welcome_text = message.text.split(None, 1)[1]
    
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute(
            "INSERT INTO group_settings (chat_id, welcome_message) VALUES (?, ?) "
            "ON CONFLICT(chat_id) DO UPDATE SET welcome_message=excluded.welcome_message",
            (chat_id, welcome_text)
        )
        await db.commit()
        
    await message.reply_text("✅ Welcome message has been successfully updated.")

@app.on_message(filters.command("userstats") & filters.group)
async def get_user_stats(client, message):
    user_id = message.from_user.id
    chat_id = message.chat.id
    
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
        
    stats_message = (
        f"📊 **User Stats for** `{target_user_id}`\n\n"
        f"**Messages Sent (Today):** {msg_count}\n"
        f"**Total Referrals:** {invited_count}\n"
    )
    
    await message.reply_text(stats_message)

@app.on_message(filters.command("topreferrers") & filters.group)
async def top_referrers(client, message):
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT user_id, invited_count FROM user_stats WHERE invited_count > 0 ORDER BY invited_count DESC LIMIT 10") as cursor:
            rows = await cursor.fetchall()
            
    if not rows:
        await message.reply_text("No successful referrals recorded yet!")
        return
        
    leaderboard = "🏆 **Top 10 Referrers**\n\n"
    for i, (uid, count) in enumerate(rows, 1):
        leaderboard += f"**{i}.** `{uid}` - {count} invites\n"
        
    await message.reply_text(leaderboard)

@app.on_message(filters.command("broadcast") & filters.user(BOT_OWNER_ID))
async def broadcast_message(client, message):
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
            await asyncio.sleep(0.1)
        except Exception as e:
            failed += 1
                
    await message.reply_text(f"✅ Broadcast complete!\nSuccess: {success}\nFailed: {failed}")

@app.on_chat_member_updated(filters.group)
async def on_member_join(client, update: ChatMemberUpdated):
    new_member = update.new_chat_member
    old_member = update.old_chat_member
    
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
                    welcome_text = f"Welcome {mention}!\n\n{welcome_text}"
                
                try:
                    await client.send_message(chat_id, welcome_text)
                except Exception as e:
                    pass
                    
    # Process Referral Tracking
    if update.invite_link and update.invite_link.creator:
        inviter_id = update.invite_link.creator.id
        joined_id = joined_user.id
        
        if inviter_id == joined_id:
            return
            
        async with aiosqlite.connect(DB_FILE) as db:
            await db.execute(
                "INSERT OR IGNORE INTO user_stats (user_id, msg_count, last_msg_date, invited_count) VALUES (?, 0, '', 0)",
                (inviter_id,)
            )
            await db.execute(
                "UPDATE user_stats SET invited_count = invited_count + 1 WHERE user_id = ?",
                (inviter_id,)
            )
            await db.commit()
            
            async with db.execute("SELECT invited_count FROM user_stats WHERE user_id = ?", (inviter_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0] == 2:
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
                        pass

@app.on_message(filters.group & ~filters.bot & ~filters.command(["invite", "setlimit", "setwelcome", "userstats", "topreferrers", "broadcast"]))
async def handle_group_message(client, message):
    if not message.from_user:
        return
        
    user_id = message.from_user.id
    chat_id = message.chat.id
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("INSERT OR IGNORE INTO known_groups (chat_id) VALUES (?)", (chat_id,))
        
        async with db.execute("SELECT daily_limit FROM group_settings WHERE chat_id = ?", (chat_id,)) as cursor:
            row_limit = await cursor.fetchone()
            group_limit = row_limit[0] if row_limit else 4
            
        async with db.execute("SELECT msg_count, last_msg_date, invited_count FROM user_stats WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            
        if row:
            msg_count, last_msg_date, invited_count = row
            
            if invited_count >= 2:
                return
                
            if last_msg_date != today_str:
                msg_count = 1
                last_msg_date = today_str
            else:
                msg_count += 1
        else:
            msg_count = 1
            last_msg_date = today_str
            invited_count = 0
            
        await db.execute(
            "INSERT OR REPLACE INTO user_stats (user_id, msg_count, last_msg_date, invited_count) VALUES (?, ?, ?, ?)",
            (user_id, msg_count, last_msg_date, invited_count)
        )
        await db.commit()
        
        if msg_count == group_limit + 1:
            warning_text = (
                f"Sir aapne phale hi {group_limit} file search ki hai. Unlimited lene se phale aapko "
                "is group pe 2 member add karna padega, tabhi aap is group pe movie file search kar sakte ho.\n\n"
                "Use /invite to get your personal referral link!"
            )
            
            try:
                await message.reply_text(warning_text)
            except Exception as e:
                pass
            
            restrict_until = datetime.utcnow() + timedelta(days=1)
            try:
                await client.restrict_chat_member(
                    chat_id=chat_id,
                    user_id=user_id,
                    permissions=ChatPermissions(can_send_messages=False),
                    until_date=restrict_until
                )
            except Exception as e:
                pass

async def health_check(request):
    return web.Response(text="Telegram Bot is Running smoothly!", status=200)

async def start_web_server():
    web_app = web.Application()
    web_app.router.add_get('/', health_check)
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    await site.start()

async def main():
    await init_db()
    await start_web_server()
    await app.start()
    logger.info("Bot started successfully!")
    await idle()
    await app.stop()

if __name__ == "__main__":
    asyncio.run(main())
