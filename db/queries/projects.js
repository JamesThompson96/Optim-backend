import db from "#db/client";

export async function createProject(
  workspace_id,
  owner_id,
  name,
  status,
  start_date,
  end_date,
) {
  const sql = `
    INSERT INTO projects (
      workspace_id, owner_id, name, status, start_date, end_date
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const {
    rows: [project],
  } = await db.query(sql, [
    workspace_id,
    owner_id,
    name,
    status,
    start_date,
    end_date,
  ]);

  return project;
}

export async function getProjects() {
  const sql = `
    SELECT * FROM projects;
  `;

  const { rows } = await db.query(sql);

  return rows;
}

export async function getProjectById(id) {
  const sql = `
    SELECT * FROM projects
    WHERE id = $1;
  `;

  const {
    rows: [project],
  } = await db.query(sql, [id]);

  return project;
}

export async function getProjectsByWorkspace(workspace_id) {
  const sql = `
    SELECT *
    FROM projects
    WHERE workspace_id = $1;
  `;

  const { rows } = await db.query(sql, [workspace_id]);

  return rows;
}

export async function getProjectsByUser(user_id) {
  const sql = `
    SELECT p.*
    FROM projects p
    JOIN project_members pm
      ON p.id = pm.project_id
    WHERE pm.user_id = $1;
  `;

  const { rows } = await db.query(sql, [user_id]);

  return rows;
}

export async function updateProject(id, name, status, start_date, end_date) {
  const sql = `
    UPDATE projects
    SET name = $2, status = $3, start_date = $4, end_date = $5,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `;

  const {
    rows: [project],
  } = await db.query(sql, [id, name, status, start_date, end_date]);

  return project;
}

export async function deleteProject(id) {
  const sql = `
    DELETE FROM projects
    WHERE id = $1
    RETURNING *;
  `;

  const {
    rows: [project],
  } = await db.query(sql, [id]);

  return project;
}

export async function getProjectMembership(projectId, userId) {
  const sql = `
    SELECT 1
    FROM project_members
    WHERE project_id = $1 AND user_id = $2;
  `;
  const { rows } = await db.query(sql, [projectId, userId]);
  return rows.length > 0;
}
