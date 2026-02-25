import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const {
  PORT = 3000,
  SESSION_SECRET = "change-me",
  DISCORD_CLIENT_ID = "",
  DISCORD_CLIENT_SECRET = "",
  DISCORD_REDIRECT_URI = "",
  DISCORD_GUILD_ID = "",
  DISCORD_STAFF_ROLE_IDS = "",
} = process.env;

const staffRoleIds = DISCORD_STAFF_ROLE_IDS.split(",").map((s) => s.trim()).filter(Boolean);
const contentPath = path.join(__dirname, "data", "content.json");

app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

// Fast server-side redirects (no meta-refresh delay)
app.get("/", (_req, res) => res.redirect(302, "/home.html"));
app.get("/index.html", (_req, res) => res.redirect(302, "/home.html"));

app.use(express.static(__dirname));

function requireStaff(req, res, next) {
  if (!req.session?.user || !req.session?.isStaff) {
    return res.status(403).json({ error: "Staff access required." });
  }
  next();
}

async function readContent() {
  const raw = await readFile(contentPath, "utf8");
  return JSON.parse(raw);
}

app.get("/api/content", async (_req, res) => {
  try {
    const content = await readContent();
    res.json(content);
  } catch {
    res.status(500).json({ error: "Could not read content." });
  }
});

app.post("/api/content", requireStaff, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid content payload." });
  }
  try {
    await writeFile(contentPath, JSON.stringify(body, null, 2));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not save content." });
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session?.user) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    isStaff: !!req.session.isStaff,
    user: req.session.user,
  });
});

app.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send("Discord OAuth is not configured in .env");
  }

  const state = crypto.randomUUID();
  req.session.oauthState = state;

  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
  url.searchParams.set("scope", "identify email guilds.members.read");
  url.searchParams.set("state", state);

  res.redirect(url.toString());
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send("Invalid OAuth state.");
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      return res.status(401).send("Failed to exchange Discord code.");
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return res.status(401).send("Could not fetch Discord account details.");
    }

    const user = await userRes.json();

    const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!memberRes.ok) {
      return res.status(403).send("You are not in the configured Discord server.");
    }

    const member = await memberRes.json();
    const memberRoles = Array.isArray(member.roles) ? member.roles : [];
    const hasStaffRole = staffRoleIds.length > 0 && staffRoleIds.some((id) => memberRoles.includes(id));

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      email: user.email,
      avatar: user.avatar,
    };
    req.session.isStaff = hasStaffRole;
    delete req.session.oauthState;

    // Verification-first flow:
    // always return to home, then frontend decides whether to auto-redirect staff.
    res.redirect(hasStaffRole ? "/home.html?verified=1&staff=1" : "/home.html?verified=1&staff=0");
  } catch {
    res.status(500).send("Discord auth failed.");
  }
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/home.html");
  });
});

app.listen(PORT, () => {
  console.log(`ASRP site running on http://localhost:${PORT}`);
});
