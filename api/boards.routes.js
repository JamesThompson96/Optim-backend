import { Router } from "express";
import requireUser from "#middleware/requireUser";
import db from "#db/client";
import { getProjectMembership, getProjectById } from "#db/queries/projects";

const router = Router();
router.use(requireUser);

const DEFAULT_COLUMNS = ["To do", "In progress", "Done"];

async function getProjectAccess(projectId, userId) {
  const project = await getProjectById(projectId);
  if (!project) return null;
  const isMember = await getProjectMembership(projectId, userId);
  return { project, isMember: isMember || project.owner_id === userId };
}

router.get("/projects/:id/board", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user.id);
  if (!access) return res.status(404).json({ error: "Project not found" });
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });

  const {
    rows: [existing],
  } = await db.query("SELECT * FROM boards WHERE project_id = $1 LIMIT 1", [
    req.params.id,
  ]);
  if (existing) return res.json({ board: existing });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [board],
    } = await client.query(
      "INSERT INTO boards (project_id, name) VALUES ($1, $2) RETURNING *",
      [req.params.id, "Main board"],
    );
    for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
      await client.query(
        "INSERT INTO columns (board_id, name, position) VALUES ($1, $2, $3)",
        [board.id, DEFAULT_COLUMNS[i], i + 1],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ board });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.get("/boards/:id/columns", async (req, res) => {
  const {
    rows: [board],
  } = await db.query("SELECT * FROM boards WHERE id = $1", [req.params.id]);
  if (!board) return res.status(404).json({ error: "Board not found" });
  const access = await getProjectAccess(board.project_id, req.user.id);
  if (!access.isMember)
    return res
      .status(403)
      .json({ error: "You are not a member of this project" });

  const { rows: columns } = await db.query(
    "SELECT * FROM columns WHERE board_id = $1 ORDER BY position ASC",
    [req.params.id],
  );
  res.json({ columns });
});

export default router;
