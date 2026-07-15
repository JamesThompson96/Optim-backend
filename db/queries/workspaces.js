import db from "#db/client";

/**
 * The functions below marked "SCAFFOLDING" cover Tickets 1-3 (schema, create,
 * list/view), which don't exist yet in this repo. They're here so Tickets
 * 4-6 have something to build on and can actually be tested end-to-end.
 * If you already built these elsewhere, delete these and keep your own --
 * just make sure the function names/shapes match what workspaces.js (the
 * router) expects.
 */

// --- SCAFFOLDING (Tickets 1-3) ------------------------------------------

export async function createWorkspace(name, ownerId) {
  const sql = `
  INSERT INTO workspaces
    (name, owner_id)
  VALUES
    ($1, $2)
  RETURNING *
  `;
  const {
    rows: [workspace],
  } = await db.query(sql, [name, ownerId]);

  // Creator is automatically an admin member of their own workspace
  await addMember(workspace.id, ownerId, "admin");

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
  WHERE id = $1
  `;
  const {
    rows: [workspace],
  } = await db.query(sql, [id]);
  return workspace;
}

// --- Tickets 4-6 ----------------------------------------------------------

/** Gets a single member's role in a workspace. Undefined if not a member. */
export async function getMembership(workspaceId, userId) {
  const sql = `
  SELECT *
  FROM workspace_members
  WHERE workspace_id = $1 AND user_id = $2
  `;
  const {
    rows: [membership],
  } = await db.query(sql, [workspaceId, userId]);
  return membership;
}

/** Adds a user to a workspace with the given role (defaults to "member"). */
export async function addMember(workspaceId, userId, role = "member") {
  const sql = `
  INSERT INTO workspace_members
    (workspace_id, user_id, role)
  VALUES
    ($1, $2, $3)
  RETURNING *
  `;
  const {
    rows: [membership],
  } = await db.query(sql, [workspaceId, userId, role]);
  return membership;
}

/** Lists every member of a workspace, joined with user info. */
export async function getMembers(workspaceId) {
  const sql = `
  SELECT u.id, u.name, u.email, wm.role, wm.joined_at
  FROM workspace_members wm
  JOIN users u ON u.id = wm.user_id
  WHERE wm.workspace_id = $1
  ORDER BY wm.joined_at ASC
  `;
  const { rows } = await db.query(sql, [workspaceId]);
  return rows;
}

/** Removes a member from a workspace. Returns the removed row, or undefined. */
export async function removeMember(workspaceId, userId) {
  const sql = `
  DELETE FROM workspace_members
  WHERE workspace_id = $1 AND user_id = $2
  RETURNING *
  `;
  const {
    rows: [removed],
  } = await db.query(sql, [workspaceId, userId]);
  return removed;
}

/** Counts how many admins a workspace currently has. */
export async function countAdmins(workspaceId) {
  const sql = `
  SELECT COUNT(*)::int AS count
  FROM workspace_members
  WHERE workspace_id = $1 AND role = 'admin'
  `;
  const {
    rows: [{ count }],
  } = await db.query(sql, [workspaceId]);
  return count;
}
