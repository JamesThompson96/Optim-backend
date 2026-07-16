import db from "#db/client";

export async function createWorkspace(name, created_by) {
  const sql = `
    INSERT INTO workspaces (name, created_by)
    VALUES ($1, $2)
    RETURNING *;
  `;

  const {
    rows: [workspace],
  } = await db.query(sql, [name, created_by]);

  return workspace;
}

export async function getWorkspaces() {
  const sql = `
    SELECT * FROM workspaces;
  `;

  const { rows } = await db.query(sql);

  return rows;
}

export async function getWorkspaceById(id) {
  const sql = `
    SELECT *
    FROM workspaces
    WHERE id = $1;
  `;

  const {
    rows: [workspace],
  } = await db.query(sql, [id]);

  return workspace;
}

export async function getMembership(workspace_id, user_id) {
  const sql = `
    SELECT *
    FROM workspace_members
    WHERE workspace_id = $1
      AND user_id = $2;
  `;

  const {
    rows: [membership],
  } = await db.query(sql, [workspace_id, user_id]);

  return membership;
}

export async function addMember(workspace_id, user_id, role = "contributor") {
  const sql = `
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const {
    rows: [membership],
  } = await db.query(sql, [workspace_id, user_id, role]);

  return membership;
}

export async function getMembers(workspace_id) {
  const sql = `
    SELECT u.id, u.name, u.email, wm.role
    FROM workspace_members wm
    JOIN users u
      ON wm.user_id = u.id
    WHERE wm.workspace_id = $1;
  `;

  const { rows } = await db.query(sql, [workspace_id]);

  return rows;
}

export async function removeMember(workspace_id, user_id) {
  const sql = `
    DELETE FROM workspace_members
    WHERE workspace_id = $1
      AND user_id = $2
    RETURNING *;
  `;

  const {
    rows: [removed],
  } = await db.query(sql, [workspace_id, user_id]);

  return removed;
}

export async function countAdmins(workspace_id) {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM workspace_members
    WHERE workspace_id = $1
      AND role = 'admin';
  `;

  const {
    rows: [{ count }],
  } = await db.query(sql, [workspace_id]);

  return count;
}