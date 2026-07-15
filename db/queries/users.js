import db from "#db/client";

export async function createUser(username, password, { name, email } = {}) {
  const sql = `
  INSERT INTO users
    (username, password, name, email)
  VALUES
    ($1, $2, $3, $4)
  RETURNING *
  `;

  const {
    rows: [user],
  } = await db.query(sql, [username, hashedPassword, name ?? null, email ?? null]);
  return user;
}

export async function getUsers() {
  const sql = `
    SELECT * FROM users;
  `;

  const { rows } = await db.query(sql);

  return rows;
}

export async function getUserById(id) {
  const sql = `
    SELECT * FROM users
    WHERE id = $1;
  `;

  const {
    rows: [user],
  } = await db.query(sql, [id]);

  return user;
}

export async function getUserByEmail(email) {
  const sql = `
    SELECT * FROM users
    WHERE email = $1;
  `;

  const {
    rows: [user],
  } = await db.query(sql, [email]);

  return user;
}

export async function getUserByGoogleId(google_id) {
  const sql = `
    SELECT * FROM users
    WHERE google_id = $1;
  `;

  const {
    rows: [user],
  } = await db.query(sql, [google_id]);

  return user;
}

export async function updateUser(id, email, name, avatar_url) {
  const sql = `
    UPDATE users
    SET email = $2,
        name = $3,
        avatar_url = $4,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `;

  const {
    rows: [user],
  } = await db.query(sql, [id, email, name, avatar_url]);

  return user;
}

export async function deleteUser(id) {
  const sql = `
    DELETE FROM users
    WHERE id = $1
    RETURNING *;
  `;

  const {
    rows: [user],
  } = await db.query(sql, [id]);

  return user;
}
