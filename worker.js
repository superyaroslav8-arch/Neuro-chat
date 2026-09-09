const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const VIDEO_MODEL = "pixverse/v6";

const COOKIE = "neuro_session";
const SESSION_DAYS = 30;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function randomId(prefix = "") {
  return prefix +
    crypto.randomUUID().replaceAll("-", "");
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

async function hash(value) {
  const data = new TextEncoder().encode(value);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return [...new Uint8Array(digest)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function passwordHash(password, salt) {
  const data = new TextEncoder().encode(
    salt + ":" + password
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return [...new Uint8Array(digest)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

function getSession(request) {
  const header = request.headers.get("Cookie") || "";

  const match = header.match(
    new RegExp(
      "(?:^|;\\s*)" +
      COOKIE +
      "=([^;]+)"
    )
  );

  return match ? match[1] : null;
}


/* DATABASE */

export class NeuroDB extends DurableObject {

  constructor(ctx, env) {
    super(ctx, env);

    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);

    const body =
      request.method === "GET"
        ? {}
        : await request.json().catch(() => ({}));

    const path = url.pathname;

    if (path === "/users/create") {
      return this.createUser(body);
    }

    if (path === "/users/get") {
      return this.getUser(body);
    }

    if (path === "/sessions/create") {
      return this.createSession(body);
    }

    if (path === "/sessions/get") {
      return this.getSession(body);
    }

    if (path === "/sessions/delete") {
      return this.deleteSession(body);
    }

    if (path === "/chats/list") {
      return this.listChats(body);
    }

    if (path === "/chats/create") {
      return this.createChat(body);
    }

    if (path === "/chats/delete") {
      return this.deleteChat(body);
    }

    if (path === "/messages/list") {
      return this.listMessages(body);
    }

    if (path === "/messages/add") {
      return this.addMessage(body);
    }

    return json({ error: "Not found" }, 404);
  }

  createUser({ username, passwordHash, salt }) {
    const id = randomId("usr_");
    const now = Date.now();

    try {
      this.sql.exec(
        `INSERT INTO users
         (id,username,password_hash,salt,created_at)
         VALUES (?,?,?,?,?)`,
        id,
        username,
        passwordHash,
        salt,
        now
      );
    } catch {
      return json(
        { error: "Такое имя пользователя уже существует." },
        409
      );
    }

    return json({
      user: {
        id,
        username
      }
    });
  }

  getUser({ username }) {
    const row = this.sql.exec(
      `SELECT * FROM users WHERE username=? LIMIT 1`,
      username
    ).one();

    return json({
      user: row || null
    });
  }

  createSession({ tokenHash, userId, expiresAt }) {
    this.sql.exec(
      `INSERT OR REPLACE INTO sessions
       (token_hash,user_id,expires_at)
       VALUES (?,?,?)`,
      tokenHash,
      userId,
      expiresAt
    );

    return json({ ok: true });
  }

  getSession({ tokenHash }) {
    const row = this.sql.exec(
      `SELECT * FROM sessions
       WHERE token_hash=? AND expires_at>?
       LIMIT 1`,
      tokenHash,
      Date.now()
    ).one();

    return json({
      session: row || null
    });
  }

  deleteSession({ tokenHash }) {
    this.sql.exec(
      `DELETE FROM sessions WHERE token_hash=?`,
      tokenHash
    );

    return json({ ok: true });
  }

  listChats({ userId }) {
    const rows = [
      ...this.sql.exec(
        `SELECT * FROM chats
         WHERE user_id=?
         ORDER BY updated_at DESC`,
        userId
      )
    ];

    return json({
      chats: rows
    });
  }

  createChat({ userId, title }) {
    const id = randomId("chat_");
    const now = Date.now();

    this.sql.exec(
      `INSERT INTO chats
       (id,user_id,title,created_at,updated_at)
       VALUES (?,?,?,?,?)`,
      id,
      userId,
      title || "Новый чат",
      now,
      now
    );

    return json({
      chat: {
        id,
        user_id: userId,
        title: title || "Новый чат",
        created_at: now,
        updated_at: now
      }
    });
  }

  deleteChat({ userId, chatId }) {
    this.sql.exec(
      `DELETE FROM messages
       WHERE chat_id=? AND user_id=?`,
      chatId,
      userId
    );

    this.sql.exec(
      `DELETE FROM chats
       WHERE id=? AND user_id=?`,
      chatId,
      userId
    );

    return json({ ok: true });
  }

  listMessages({ userId, chatId }) {
    const rows = [
      ...this.sql.exec(
        `SELECT role,content,created_at
         FROM messages
         WHERE chat_id=? AND user_id=?
         ORDER BY created_at ASC`,
        chatId,
        userId
      )
    ];

    return json({
      messages: rows
    });
  }

  addMessage({ userId, chatId, role, content }) {
    const id = randomId("msg_");
    const now = Date.now();

    this.sql.exec(
      `INSERT INTO messages
       (id,chat_id,user_id,role,content,created_at)
       VALUES (?,?,?,?,?,?)`,
      id,
      chatId,
      userId,
      role,
      content,
      now
    );

    this.sql.exec(
      `UPDATE chats
       SET updated_at=?
       WHERE id=? AND user_id=?`,
      now,
      chatId,
      userId
    );

    return json({ ok: true });
  }
}


function db(env) {
  const id = env.NEURO_DB.idFromName("main");
  return env.NEURO_DB.get(id);
}

async function dbCall(env, path, body) {
  const response =
    await db(env).fetch(
      new Request(
        "https://database.local" + path,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(body)
        }
      )
    );

  return response.json();
}


/* AUTH */

async function currentUser(request, env) {
  const token = getSession(request);

  if (!token) return null;

  const tokenHash = await hash(token);

  const data = await dbCall(
    env,
    "/sessions/get",
    { tokenHash }
  );

  if (!data.session) return null;

  const user = await dbCall(
    env,
    "/users/get",
    { username: data.session.username }
  );

  if (user.user) return user.user;

  const users = await dbCall(
    env,
    "/users/by-id",
    { id: data.session.user_id }
  );

  return users.user || null;
}


/* REQUEST HANDLER */

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status:204
      });
    }

    try {

      /* REGISTER */

      if (
        url.pathname === "/api/auth/register" &&
        request.method === "POST"
      ) {
        const body =
          await request.json();

        const username =
          String(body.username || "").trim();

        const password =
          String(body.password || "");

        if(username.length < 3)
          return json({
            error:"Имя пользователя должно содержать минимум 3 символа."
          },400);

        if(password.length < 6)
          return json({
            error:"Пароль должен содержать минимум 6 символов."
          },400);

        const exists =
          await dbCall(
            env,
            "/users/get",
            {username}
          );

        if(exists.user){
          return json({
            error:"Такое имя пользователя уже существует."
          },409);
        }

        const salt =
          crypto.randomUUID();

        const pHash =
          await passwordHash(
            password,
            salt
          );

        const created =
          await dbCall(
            env,
            "/users/create",
            {
              username,
              passwordHash:pHash,
              salt
            }
          );

        if(!created.user)
          return created;

        const token =
          crypto.randomUUID() +
          crypto.randomUUID();

        await dbCall(
          env,
          "/sessions/create",
          {
            tokenHash:await hash(token),
            userId:created.user.id,
            expiresAt:
              Date.now() +
              SESSION_DAYS*86400000
          }
        );

        return new Response(
          JSON.stringify({
            user:created.user
          }),
          {
            headers:{
              "content-type":
                "application/json; charset=utf-8",
              "set-cookie":
                cookie(
                  COOKIE,
                  token,
                  SESSION_DAYS*86400
                )
            }
          }
        );
      }


      /* LOGIN */

      if(
        url.pathname === "/api/auth/login" &&
        request.method === "POST"
      ){
        const body=await request.json();

        const username=
          String(body.username||"").trim();

        const password=
          String(body.password||"");

        const result=
          await dbCall(
            env,
            "/users/get",
            {username}
          );

        if(!result.user){
          return json({
            error:"Неверное имя пользователя или пароль."
          },401);
        }

        const check=
          await passwordHash(
            password,
            result.user.salt
          );

        if(check!==result.user.password_hash){
          return json({
            error:"Неверное имя пользователя или пароль."
          },401);
        }

        const token=
          crypto.randomUUID()+
          crypto.randomUUID();

        await dbCall(
          env,
          "/sessions/create",
          {
            tokenHash:await hash(token),
            userId:result.user.id,
            expiresAt:
              Date.now()+
              SESSION_DAYS*86400000
          }
        );

        return new Response(
          JSON.stringify({
            user:{
              id:result.user.id,
              username:result.user.username
            }
          }),
          {
            headers:{
              "content-type":
                "application/json; charset=utf-8",
              "set-cookie":
                cookie(
                  COOKIE,
                  token,
                  SESSION_DAYS*86400
                )
            }
          }
        );
      }


      /* ME */

      if(
        url.pathname === "/api/auth/me"
      ){
        const token=getSession(request);

        if(!token)
          return json({user:null});

        const session=
          await dbCall(
            env,
            "/sessions/get",
            {tokenHash:await hash(token)}
          );

        if(!session.session)
          return json({user:null});

        return json({
          user:{
            id:session.session.user_id
          }
        });
      }


      /* LOGOUT */

      if(
        url.pathname === "/api/auth/logout"
      ){
        const token=getSession(request);

        if(token){
          await dbCall(
            env,
            "/sessions/delete",
            {tokenHash:await hash(token)}
          );
        }

        return new Response(
          JSON.stringify({ok:true}),
          {
            headers:{
              "content-type":"application/json",
              "set-cookie":clearCookie(COOKIE)
            }
          }
        );
      }


      /* AUTH REQUIRED */

      const token=getSession(request);

      if(!token)
        return json({
          error:"Требуется войти в аккаунт."
        },401);

      const session=
        await dbCall(
          env,
          "/sessions/get",
          {tokenHash:await hash(token)}
        );

      if(!session.session)
        return json({
          error:"Сессия истекла. Войдите снова."
        },401);

      const userId=
        session.session.user_id;


      /* CHATS */

      if(
        url.pathname === "/api/chats" &&
        request.method === "GET"
      ){
        return dbCall(
          env,
          "/chats/list",
          {userId}
        );
      }

      if(
        url.pathname === "/api/chats" &&
        request.method === "POST"
      ){
        const body=await request.json();

        return dbCall(
          env,
          "/chats/create",
          {
            userId,
            title:
              String(
                body.title ||
                "Новый чат"
              ).slice(0,100)
          }
        );
      }


      const chatMatch=
        url.pathname.match(
          /^\/api\/chats\/([^/]+)\/messages$/
        );

      if(
        chatMatch &&
        request.method === "GET"
      ){
        return dbCall(
          env,
          "/messages/list",
          {
            userId,
            chatId:decodeURIComponent(
              chatMatch[1]
            )
          }
        );
      }


      const deleteMatch=
        url.pathname.match(
          /^\/api\/chats\/([^/]+)$/
        );

      if(
        deleteMatch &&
        request.method === "DELETE"
      ){
        return dbCall(
          env,
          "/chats/delete",
          {
            userId,
            chatId:decodeURIComponent(
              deleteMatch[1]
            )
          }
        );
      }


      /* AI CHAT */

      if(
        url.pathname === "/api/chat" &&
        request.method === "POST"
      ){
        const body=await request.json();

        const chatId=
          String(body.chatId||"");

        let messages=
          Array.isArray(body.messages)
            ? body.messages
            : [];

        messages=messages
          .filter(
            m =>
              m &&
              (
                m.role==="user" ||
                m.role==="assistant"
              ) &&
              typeof m.content==="string"
          )
          .slice(-40)
          .map(m=>({
            role:m.role,
            content:m.content.slice(0,12000)
          }));

        if(!messages.length){
          return json({
            error:"Сообщение пустое."
          },400);
        }

        const result=
          await env.AI.run(
            MODEL,
            {
              messages:[
                {
                  role:"system",
                  content:
                    "Ты Нейро-чат. Отвечай на русском языке, если пользователь пишет по-русски. Отвечай точно, понятно и по существу. Не придумывай факты."
                },
                ...messages
              ],
              chat_template_kwargs:{
                enable_thinking:false
              }
            }
          );

        const answer=
          result?.response ??
          result?.result?.response ??
          result?.choices?.[0]?.message?.content ??
          result?.output_text ??
          result?.text;

        if(
          typeof answer!=="string" ||
          !answer.trim()
        ){
          console.error(
            "Workers AI response:",
            JSON.stringify(result)
          );

          return json({
            error:"AI не вернул корректный текстовый ответ."
          },502);
        }

        const lastUser=
          messages[messages.length-1];

        if(
          lastUser &&
          lastUser.role==="user"
        ){
          await dbCall(
            env,
            "/messages/add",
            {
              userId,
              chatId,
              role:"user",
              content:lastUser.content
            }
          );
        }

        await dbCall(
          env,
          "/messages/add",
          {
            userId,
            chatId,
            role:"assistant",
            content:answer
          }
        );

        return json({
          message:answer
        });
      }


      /* IMAGE */

      if(
        url.pathname === "/api/generate/image" &&
        request.method === "POST"
      ){
        const body=await request.json();

        const prompt=
          String(body.prompt||"").trim();

        if(!prompt)
          return json({
            error:"Промпт пустой."
          },400);

        const result=
          await env.AI.run(
            IMAGE_MODEL,
            {prompt}
          );

        if(!result?.image){
          return json({
            error:"Модель не вернула изображение."
          },502);
        }

        return json({
          image:
            "data:image/jpeg;base64,"+
            result.image
        });
      }


      /* VIDEO */

      if(
        url.pathname === "/api/generate/video" &&
        request.method === "POST"
      ){
        const body=await request.json();

        const result=
          await env.AI.run(
            VIDEO_MODEL,
            {
              prompt:String(body.prompt||""),
              duration:Number(body.duration||5),
              aspect_ratio:
                body.aspect_ratio||"16:9",
              generate_audio:
                body.generate_audio !== false
            }
          );

        const video=
          result?.video ??
          result?.result?.video;

        if(!video){
          return json({
            error:
              "Видео не было создано. Проверьте доступность модели видео в вашем Cloudflare AI."
          },502);
        }

        return json({
          video
        });
      }


      return json({
        error:"Маршрут не найден."
      },404);

    }catch(error){

      console.error(error);

      return json({
        error:
          error?.message ||
          "Внутренняя ошибка сервера."
      },500);
    }
  }
};