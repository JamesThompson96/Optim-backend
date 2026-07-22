import db from "#db/client";

import { createUser } from "#db/queries/users";
import { createWorkspace } from "#db/queries/workspaces";
import { addWorkspaceMember } from "#db/queries/workspaceMembers";
import { createProject } from "#db/queries/projects";
import { addProjectMember } from "#db/queries/projectMembers";
import { createBoardWithDefaultColumns } from "#db/queries/boards";
import { createEpic } from "#db/queries/epics";
import { createTask } from "#db/queries/tasks";
import { createTaskUpdate } from "#db/queries/taskUpdates";

await db.connect();
await seed();
await db.end();

console.log("🌱 Database seeded.");

async function seed() {
  const tyler = await createUser({
    email: "tyler@example.com",
    password: "password123",
    name: "Tyler",
    username: "tyler",
    googleId: "google-tyler",
  });

  const sarah = await createUser({
    email: "sarah@example.com",
    password: "password123",
    name: "Sarah",
    username: "sarah",
    googleId: "google-sarah",
  });

  const mike = await createUser({
    email: "mike@example.com",
    password: "password123",
    name: "Mike",
    username: "mike",
    googleId: "google-mike",
  });

  const workspace = await createWorkspace(
    "Optim Development Team",
    tyler.id,
  );

  await addWorkspaceMember(workspace.id, tyler.id, "admin");
  await addWorkspaceMember(workspace.id, sarah.id, "manager");
  await addWorkspaceMember(workspace.id, mike.id, "contributor");

  const project = await createProject(
    workspace.id,
    sarah.id,
    "Optim MVP",
    "active",
    "2026-07-15",
    null,
  );

  await addProjectMember(project.id, sarah.id);
  await addProjectMember(project.id, mike.id);
  await addProjectMember(project.id, tyler.id);

  const board = await createBoardWithDefaultColumns(project.id);

  const todoColumn = board.columns[0];

  const epic = await createEpic(
    project.id,
    "Authentication System",
  );

  const task = await createTask(
    {
      projectId: project.id,
      columnId: todoColumn.id,
      title: "Implement Google Authentication",
      description: "Create login flow using Google OAuth.",
      type: "task",
      priority: "high",
      dueDate: null,
      assigneeId: mike.id,
    },
    mike.id,
    board.id,
  );

  await createTaskUpdate(
    task.id,
    mike.id,
    "Started working on authentication setup.",
  );

  console.log("Seed complete!");
}