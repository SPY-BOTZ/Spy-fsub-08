import os
import asyncio
import logging
from datetime import datetime, timedelta
import aiosqlite
from pyrogram import Client, filters, idle
from pyrogram.types import ChatPermissions, ChatMemberUpdated
from pyrogram.enums import ChatMemberStatus
from aiohttp import web

# Logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# ==========================================
# ⚠️ API DETAILS YAHAN DALEN (Ya Koyeb Env Variables me dalen)
# ==========================================
API_ID = int(os.environ.get("API_ID", 12345678))  # Apna API ID dalein
API_HASH = os.environ.get("API_HASH", "aapka_api_hash") # Apna API HASH dalein
BOT_TOKEN = os.environ.get("BOT_TOKEN", "aapka_bot_token") # Apna BOT TOKEN dalein
BOT_OWNER_ID = int(os.environ.get("BOT_OWNER_ID", 123456789)) # Apna Telegram ID
PORT = int(os.environ.get("PORT", 8000))
# ==========================================

app = Client("group_manager_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)
DB_FILE = "bot_data.db"

async def init_db():
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id INTEGER PRIMARY KEY, msg_count INTEGER,
                last_msg_date TEXT, invited_count INTEGER DEFAULT 0
            )
        """)
        try: await db.execute("ALTER TABLE user_stats ADD COLUMN invited_count INTEGER DEFAULT 0")
        except: pass
        await db.execute("""
            CREATE TABLE IF NOT EXISTS group_settings (
                chat_id INTEGER PRIMARY KEY, daily_limit INTEGER DEFAULT 4
            )
        """)
        try: await db.execute("ALTER TABLE group_settings ADD COLUMN welcome_message TEXT")
        except: pass
        await db.execute("CREATE TABLE IF NOT EXISTS known_groups (chat_id INTEGER PRIMARY KEY)")
        await db.commit()

@app.on_message(filters.command("invite") & filters.group)
async def generate_invite(client, message):
    try:
        link = await client.create_chat_invite_link(message.chat.id, name=f"invite_{message.from_user.id}")
        await message.reply_text(f"Here is your unique referral link:\n{link.invite_link}\n\nShare this with 2 friends to unlock unlimited movie searches!")
    except:
        await message.reply_text("Error. Ensure I have 'Invite Users' admin rights.")

@app.on_chat_member_updated(filters.group)
async def on_member_join(client, update: ChatMemberUpdated):
    if not (update.new_chat_member and update.new_chat_member.status == ChatMemberStatus.MEMBER and (not update.old_chat_member or update.old_chat_member.status in [ChatMemberStatus.LEFT, ChatMemberStatus.BANNED])):
        return
        
    chat_id, joined_user = update.chat.id, update.new_chat_member.user
    
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT welcome_message FROM group_settings WHERE chat_id = ?", (chat_id,)) as cursor:
            row = await cursor.fetchone()
            if row and row[0]:
                text = row[0].replace("{user}", joined_user.mention) if "{user}" in row[0] else f"Welcome {joined_user.mention}!\n\n{row[0]}"
                try: await client.send_message(chat_id, text)
                except: pass
                    
    if update.invite_link and update.invite_link.creator:
        inviter_id = update.invite_link.creator.id
        if inviter_id == joined_user.id: return
            
        async with aiosqlite.connect(DB_FILE) as db:
            await db.execute("INSERT OR IGNORE INTO user_stats (user_id, msg_count, last_msg_date, invited_count) VALUES (?, 0, '', 0)", (inviter_id,))
            await db.execute("UPDATE user_stats SET invited_count = invited_count + 1 WHERE user_id = ?", (inviter_id,))
            await db.commit()
            
            async with db.execute("SELECT invited_count FROM user_stats WHERE user_id = ?", (inviter_id,)) as cursor:
                if (await cursor.fetchone())[0] == 2:
                    try:
                        await client.restrict_chat_member(chat_id, inviter_id, ChatPermissions(can_send_messages=True, can_send_media_messages=True, can_send_other_messages=True))
                        await client.send_message(chat_id, f"🎉 Congrats! <a href='tg://user?id={inviter_id}'>User</a> invited 2 members and unlocked unlimited searches!")
                    except: pass

@app.on_message(filters.group & ~filters.bot & ~filters.command(["invite", "setlimit", "setwelcome", "userstats", "topreferrers", "broadcast"]))
async def handle_group_message(client, message):
    if not message.from_user: return
    user_id, chat_id, today_str = message.from_user.id, message.chat.id, datetime.utcnow().strftime("%Y-%m-%d")
    
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("INSERT OR IGNORE INTO known_groups (chat_id) VALUES (?)", (chat_id,))
        async with db.execute("SELECT daily_limit FROM group_settings WHERE chat_id = ?", (chat_id,)) as c: limit = (await c.fetchone() or [4])[0]
        async with db.execute("SELECT msg_count, last_msg_date, invited_count FROM user_stats WHERE user_id = ?", (user_id,)) as c: row = await c.fetchone()
            
        if row:
            if row[2] >= 2: return # Unlimited searches unlocked
            msg_count = 1 if row[1] != today_str else row[1] + 1
        else:
            msg_count, invited_count = 1, 0
            
        await db.execute("INSERT OR REPLACE INTO user_stats (user_id, msg_count, last_msg_date, invited_count) VALUES (?, ?, ?, ?)", (user_id, msg_count, today_str, row[2] if row else 0))
        await db.commit()
        
        if msg_count == limit + 1:
            try: await message.reply_text(f"Sir aapne {limit} file search kar li hain. Unlimited searches ke liye `/invite` use karke 2 dosto ko add karein!")
            except: pass
            try: await client.restrict_chat_member(chat_id, user_id, ChatPermissions(can_send_messages=False), datetime.utcnow() + timedelta(days=1))
            except: pass

async def health_check(request): return web.Response(text="Bot is Running!", status=200)

async def main():
    await init_db()
    web_app = web.Application()
    web_app.router.add_get('/', health_check)
    runner = web.AppRunner(web_app)
    await runner.setup()
    await web.TCPSite(runner, '0.0.0.0', PORT).start()
    await app.start()
    logger.info("Bot started!")
    await idle()
    await app.stop()

if __name__ == "__main__":
    asyncio.run(main())
