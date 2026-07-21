import express from "express";
const app = express();
export default app;

import usersRouter from "#api/auth.routes";
import workspacesRouter from "#api/workspaces.routes";
import getUserFromToken from "#middleware/getUserFromToken";
import handlePostgresErrors from "#middleware/handlePostgresErrors";
import cors from "cors";
import morgan from "morgan";
import taskCommentsRoutes from "#api/taskComments.routes";
import commentRoutes from "#api/comments.routes";
import columnsRouter from "#api/columns.routes";
import taskLabelsRoutes from "#api/taskLabels.routes";
import projectLabelsRoutes from "#api/projectLabels.routes";
import labelRoutes from "#api/labels.routes";
import projectTaskRoutes from "#api/projectTasks.routes";
import taskRoutes from "#api/tasks.routes";
import boardsRouter from "#api/boards.routes";
import projectsRouter from "#api/temporaryprojects.routes";

app.use(cors({ origin: process.env.CORS_ORIGIN ?? /localhost/ }));

app.use(morgan("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(getUserFromToken);

app.get("/", (req, res) => res.send("Hello, World!"));

app.use("/users", usersRouter);
app.use("/workspaces", workspacesRouter);

app.use("/tasks", taskCommentsRoutes);
app.use("/comments", commentRoutes);

app.use("/tasks", taskLabelsRoutes);
app.use("/projects", projectLabelsRoutes);
app.use("/labels", labelRoutes);

app.use("/projects", projectTaskRoutes);
app.use("/tasks", taskRoutes);

app.use(handlePostgresErrors);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Sorry! Something went wrong.");
});

app.use("/columns", columnsRouter);

app.use("/tasks", tasksRouter);
app.use("boards", boardsRouter);
app.use("/projects", projectsRouter);
