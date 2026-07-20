import db from "#db/client";
import bcrypt from "bcrypt";

export async function createUser({
  email,
  password,
  name,
  username = null,
  googleId = null,
  avatarUrl = null,
}) {
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const {
    rows: [user],
  } = await db.query(
    `INSERT INTO users (google_id, username, email, name, password_hash, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [googleId, username, email, name, passwordHash, avatarUrl],
  );
  return user;
}

export async function getUserByIdentifierAndPassword(identifier, password) {
  const {
    rows: [user],
  } = await db.query("SELECT * FROM users WHERE email = $1 OR username = $1", [
    identifier,
  ]);
  if (!user || !user.password_hash) return null;

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return null;

  return user;
}

export async function getUserById(id) {
  const {
    rows: [user],
  } = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return user;
}

export async function getUserByEmail(email) {
  const {
    rows: [user],
  } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  return user;
}

export async function getUserByGoogleId(googleId) {
  const {
    rows: [user],
  } = await db.query("SELECT * FROM users WHERE google_id = $1", [googleId]);
  return user;
}
