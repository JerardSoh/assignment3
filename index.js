const express = require("express");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { format } = require("date-fns");
const app = express();
const port = 3002;

app.use(express.json());

// MySQL connection setup
const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "grookey",
    database: "taskmanagement",
});

// Function to check if user is in a group
const checkGroup = async (username, groupname) => {
    try {
        const [result] = await db.execute(
            "SELECT * FROM usergroup WHERE username = ? AND groupname = ?",
            [username, groupname]
        );
        return result.length > 0;
    } catch (err) {
        throw err;
    }
};

// CreateTask Route
app.post("/CreateTask", async (req, res) => {
    const {
        username,
        password,
        Task_app_Acronym,
        Task_Name,
        Task_description,
        Task_plan,
    } = req.body;

    // Check if mandatory fields are provided
    if (!username || !password || !Task_app_Acronym || !Task_Name) {
        return res
            .status(400)
            .json({ message: "Invalid or missing mandatory fields" });
    }

    // Validate that all required fields are strings
    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        typeof Task_app_Acronym !== "string" ||
        typeof Task_Name !== "string"
    ) {
        return res.status(400).json({
            message: "Invalid input. All required fields must be strings.",
        });
    }

    // Validate that optional fields are either strings or undefined/null
    if (
        (Task_description && typeof Task_description !== "string") ||
        (Task_plan && typeof Task_plan !== "string")
    ) {
        return res.status(400).json({
            message:
                "Invalid input. Optional fields must be strings if provided.",
        });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        // Check if plan exists
        if (Task_plan) {
            const [plan] = await connection.query(
                "SELECT * FROM Plan WHERE Plan_MVP_Name = ?",
                [Task_plan]
            );
            if (plan.length === 0) {
                return res.status(400).json({ message: "Plan not found" });
            }
        }

        // Check if app exists
        const [app] = await connection.query(
            "SELECT * FROM App WHERE App_Acronym = ?",
            [Task_app_Acronym]
        );
        if (app.length === 0) {
            return res.status(404).json({ message: "App not found" });
        }

        // Check username exists
        const [users] = await connection.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check if user can create task
        const appPermitCreateGroup = app[0].App_permit_Create;
        const isInGroup = await checkGroup(user.username, appPermitCreateGroup);
        if (!isInGroup) {
            return res.status(403).json({
                message: "User does not have permission to create task",
            });
        }

        // Create Task_id (<App_Acronym_App_Rnumber>)
        const Task_id = `${Task_app_Acronym}_${app[0].App_Rnumber + 1}`;

        // Update App_Rnumber in App that is App_Acronym to be + 1
        await connection.execute(
            "UPDATE App SET App_Rnumber = App_Rnumber + 1 WHERE App_Acronym = ?",
            [Task_app_Acronym]
        );

        const Task_state = "open";
        const Task_creator = user.username;
        const Task_owner = user.username;

        // Create task_createDate
        const unformattedTask_createDate = new Date();
        const Task_createDate = format(
            unformattedTask_createDate,
            "yyyy-MM-dd"
        );

        // Create notes with format of [Task_createDate, Task_state] Task_notes
        const Task_notes = `[${unformattedTask_createDate}, ${Task_state}] ${Task_creator} has created task.\n ##########################################################\n`;

        // Insert the new task
        await connection.execute(
            "INSERT INTO Task (Task_Name, Task_description, Task_notes, Task_id, Task_plan, Task_app_Acronym, Task_state, Task_creator, Task_owner, Task_createDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                Task_Name,
                Task_description,
                Task_notes,
                Task_id,
                Task_plan || null,
                Task_app_Acronym,
                Task_state,
                Task_creator,
                Task_owner,
                Task_createDate,
            ]
        );

        await connection.commit();

        res.status(200).json({
            Task_id,
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error:", error.message);
        res.status(500).json({
            message: "Internal server error",
        });
    } finally {
        connection.release();
    }
});

// GetTaskbyState route
app.post("/GetTaskbyState", async (req, res) => {
    const { username, password, Task_state } = req.body;

    // Check if mandatory fields are provided
    if (!username || !password || !Task_state) {
        return res
            .status(400)
            .json({ message: "Invalid or missing mandatory fields" });
    }

    // Validate that all required fields are strings
    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        typeof Task_state !== "string"
    ) {
        return res.status(400).json({
            message: "Invalid input. All required fields must be strings.",
        });
    }

    // Validate Task_state is either 'open', 'todo', 'doing', 'done', 'closed'
    if (
        Task_state !== "open" &&
        Task_state !== "todo" &&
        Task_state !== "doing" &&
        Task_state !== "done" &&
        Task_state !== "closed"
    ) {
        return res.status(400).json({
            message:
                "Invalid input. Task_state must be 'open', 'todo', 'doing', 'done', or 'closed'.",
        });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check username exists
        const [users] = await connection.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Get all tasks with Task_state
        const [tasks] = await connection.query(
            "SELECT * FROM task WHERE Task_state = ?",
            [Task_state]
        );

        // For each task in tasks, construct a json object of an array of tasks with Task_id, Task_Name, Task_description, Task_owner, Task_creator, Task_plan, Task_createDate
        const tasksArray = tasks.map((task) => {
            return {
                Task_id: task.Task_id,
                Task_Name: task.Task_Name,
                Task_description: task.Task_description,
                Task_owner: task.Task_owner,
                Task_creator: task.Task_creator,
                Task_plan: task.Task_plan,
                Task_createDate: task.Task_createDate,
            };
        });

        await connection.commit();

        res.status(200).json(tasksArray);
    } catch (error) {
        await connection.rollback();
        console.error("Error:", error.message);
        res.status(500).json({
            message: "Internal server error",
        });
    } finally {
        connection.release();
    }
});

// PromoteTask2Done route
app.patch("/PromoteTask2Done", async (req, res) => {
    const { username, password, Task_id, Task_app_Acronym } = req.body;

    // Check if mandatory fields are provided
    if (!username || !password || !Task_id || !Task_app_Acronym) {
        return res
            .status(400)
            .json({ message: "Invalid or missing mandatory fields" });
    }

    // Validate that all required fields are strings
    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        typeof Task_id !== "string" ||
        typeof Task_app_Acronym !== "string"
    ) {
        return res.status(400).json({
            message: "Invalid input. All required fields must be strings.",
        });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Check if app exists
        const [app] = await connection.query(
            "SELECT * FROM App WHERE App_Acronym = ?",
            [Task_app_Acronym]
        );
        if (app.length === 0) {
            return res.status(404).json({ message: "App not found" });
        }

        // Check if task exists
        const [tasks] = await connection.query(
            "SELECT * FROM Task WHERE Task_id = ?",
            [Task_id]
        );
        if (tasks.length === 0) {
            return res.status(404).json({ message: "Task not found" });
        }
        const task = tasks[0];

        // Check if task is in 'doing' state
        if (task.Task_state !== "doing") {
            return res.status(400).json({
                message: "Task is not in 'doing' state",
            });
        }

        // Check username exists
        const [users] = await connection.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check if user can move task from doing to done
        const [appPermitDoing] = await db.query(
            "SELECT App_permit_Doing FROM App WHERE App_Acronym = ? ",
            [Task_app_Acronym]
        );
        const appPermitDoingGroup = appPermitDoing[0].App_permit_Doing;
        const isInGroup = await checkGroup(user.username, appPermitDoingGroup);
        if (!isInGroup) {
            return res.status(403).json({
                message: "User does not have permission to move task to done",
            });
        }

        // Update the task state to 'done'
        await connection.execute(
            "UPDATE Task SET Task_state = 'done' WHERE Task_id = ?",
            [Task_id]
        );

        // Create notes with format of [Task_createDate, Task_state] Task_notes
        const unformattedTask_createDate = new Date();
        const addTask_notes = `[${unformattedTask_createDate}, '${task.Task_state}'] ${user.username} has completed the Task.\n ##########################################################\n`;

        // Update Task_notes
        await connection.execute(
            "UPDATE Task SET Task_notes = CONCAT(?, Task_notes) WHERE Task_id = ? ",
            [addTask_notes, Task_id]
        );

        // Update Task_owner
        await connection.execute(
            "UPDATE Task SET Task_owner = ? WHERE Task_id = ?",
            [user.username, Task_id]
        );

        // Start of sending email section
        const [appPermitDone] = await db.query(
            "SELECT App_permit_Done FROM App WHERE App_Acronym = ? ",
            [Task_app_Acronym]
        );

        const appPermitDoneGroup = appPermitDone[0].App_permit_Done;
        // check if appPermitDoneGroup is not empty
        if (appPermitDoneGroup) {
            // get all users from the done group
            const [users] = await db.query(
                "SELECT username FROM usergroup WHERE groupname = ?",
                [appPermitDoneGroup]
            );
            const usernames = users.map((user) => user.username);
            // Get all user emails
            const [emails] = await db.query(
                "SELECT email FROM users WHERE username IN (?) AND status = true",
                [usernames]
            );

            // Send email to all users in the group, if there is any
            if (emails.length > 0) {
                const transporter = nodemailer.createTransport({
                    service: "outlook",
                    auth: {
                        user: process.env.EMAIL,
                        pass: process.env.EMAIL_PASSWORD,
                    },
                });

                const mailOptions = {
                    from: process.env.EMAIL,
                    to: emails.map((email) => email.email).join(","),
                    subject: `${task.Task_id} has been completed!`,
                    text: `Task ${task.Task_Name} is completed by ${Task_owner}`,
                };

                transporter.sendMail(mailOptions);
            }
        }

        await connection.commit();

        res.status(200).json({
            Task_id,
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error:", error.message);
        res.status(500).json({
            message: "Internal server error",
        });
    } finally {
        connection.release();
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
