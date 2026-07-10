import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "#db/pool";
import { requireAuth } from "#middleware/auth";

const router = Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
  };
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "name, email, and password are required" });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "password must be at least 8 characters" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const {
      rows: [user],
    } = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, avatar_url`,
      [name, email.toLowerCase(), passwordHash],
    );

    const token = signToken(user.id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation on users.email
      return res
        .status(409)
        .json({ error: "An account with that email already exists" });
    }
    throw err;
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const {
    rows: [user],
  } = await pool.query(
    "SELECT id, name, email, password_hash, avatar_url FROM users WHERE email = $1",
    [email.toLowerCase()],
  );

  // Compare against a dummy hash if no user was found, so login timing doesn't
  // leak whether an email exists in the system.
  const hashToCheck =
    user?.password_hash || "$2b$10$invalidsaltinvalidsaltinvalidsO";
  const passwordMatches = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const {
    rows: [user],
  } = await pool.query(
    "SELECT id, name, email, avatar_url FROM users WHERE id = $1",
    [req.user.sub],
  );

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ user: publicUser(user) });
});

export default router;
