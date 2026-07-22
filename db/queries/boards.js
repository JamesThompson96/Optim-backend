import db from "#db/client";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

export async function createBoardWithDefaultColumns(projectId) {
  const {
    rows: [board],
  } = await db.query(
    "INSERT INTO boards (project_id, name) VALUES ($1, $2) RETURNING *",
    [projectId, "Main Board"],
  );

  const columns = [];

  for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
    const {
      rows: [column],
    } = await db.query(
      "INSERT INTO columns (board_id, name, position) VALUES ($1, $2, $3) RETURNING *",
      [board.id, DEFAULT_COLUMNS[i], i],
    );

    columns.push(column);
  }

  return { ...board, columns };
}

export async function getBoardForProject(projectId) {
  const {
    rows: [board],
  } = await db.query(
    "SELECT * FROM boards WHERE project_id = $1",
    [projectId],
  );

  return board;
}

export async function getColumnsForBoard(boardId) {
  const { rows } = await db.query(
    "SELECT * FROM columns WHERE board_id = $1 ORDER BY position ASC",
    [boardId],
  );

  return rows;
}