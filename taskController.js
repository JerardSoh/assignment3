const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { format } = require("date-fns");
const nodemailer = require("nodemailer");

// MySQL connection setup
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
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

const createTask = async (req, res) => {
    const {
        username,
        password,
        Task_app_Acronym,
        Task_Name,
        Task_description,
        Task_plan,
    } = req.body;

    if (!username || !password || !Task_app_Acronym || !Task_Name) {
        return res
            .status(400)
            .json({ message: "Invalid or missing mandatory fields" });
    }

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
        if (Task_plan) {
            const [plan] = await connection.query(
                "SELECT * FROM Plan WHERE Plan_MVP_Name = ?",
                [Task_plan]
            );
            if (plan.length === 0) {
                return res.status(400).json({ message: "Plan not found" });
            }
        }

        const [app] = await connection.query(
            "SELECT * FROM App WHERE App_Acronym = ?",
            [Task_app_Acronym]
        );
        if (app.length === 0) {
            return res.status(400).json({ message: "App not found" });
        }

        const [users] = await connection.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const appPermitCreateGroup = app[0].App_permit_Create;
        const isInGroup = await checkGroup(user.username, appPermitCreateGroup);
        if (!isInGroup) {
            return res.status(403).json({
                message: "User does not have permission to create task",
            });
        }

        const Task_id = `${Task_app_Acronym}_${app[0].App_Rnumber + 1}`;

        await connection.execute(
            "UPDATE App SET App_Rnumber = App_Rnumber + 1 WHERE App_Acronym = ?",
            [Task_app_Acronym]
        );

        const Task_state = "open";
        const Task_creator = user.username;
        const Task_owner = user.username;

        const unformattedTask_createDate = new Date();
        const Task_createDate = format(
            unformattedTask_createDate,
            "yyyy-MM-dd"
        );

        const Task_notes = `[${unformattedTask_createDate}, ${Task_state}] ${Task_creator} has created task.\n ##########################################################\n`;

        await connection.execute(
            "INSERT INTO Task (Task_Name, Task_description, Task_notes, Task_id, Task_plan, Task_app_Acronym, Task_state, Task_creator, Task_owner, Task_createDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                Task_Name,
                Task_description || null,
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
};

const getTaskByState = async (req, res) => {
    const { username, password, Task_state } = req.body;

    if (!username || !password || !Task_state) {
        return res
            .status(400)
            .json({ message: "Invalid or missing mandatory fields" });
    }

    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        typeof Task_state !== "string"
    ) {
        return res.status(400).json({
            message: "Invalid input. All required fields must be strings.",
        });
    }

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

        const [users] = await connection.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const [tasks] = await connection.query(
            "SELECT * FROM task WHERE Task_state = ?",
            [Task_state]
        );

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
};

const promoteTask2Done = async (req, res) => {
    const { username, password, Task_id, Task_app_Acronym } = req.body;

    if (!username || !password || !Task_id || !Task_app_Acronym) {
        return res
            .status(400)
            .json({ message: "Invalid or missing mandatory fields" });
    }

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

        const [app] = await connection.query(
            "SELECT * FROM App WHERE App_Acronym = ?",
            [Task_app_Acronym]
        );
        if (app.length === 0) {
            return res.status(400).json({ message: "App not found" });
        }

        const [tasks] = await connection.query(
            "SELECT * FROM Task WHERE Task_id = ?",
            [Task_id]
        );
        if (tasks.length === 0) {
            return res.status(400).json({ message: "Task not found" });
        }
        const task = tasks[0];

        if (task.Task_state !== "doing") {
            return res.status(400).json({
                message: "Task is not in 'doing' state",
            });
        }

        const [users] = await connection.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const [appPermitDoing] = await connection.query(
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

        await connection.execute(
            "UPDATE Task SET Task_state = 'done' WHERE Task_id = ?",
            [Task_id]
        );

        const unformattedTask_createDate = new Date();
        const addTask_notes = `[${unformattedTask_createDate}, '${task.Task_state}'] ${user.username} has completed the Task.\n ##########################################################\n`;

        await connection.execute(
            "UPDATE Task SET Task_notes = CONCAT(?, Task_notes) WHERE Task_id = ? ",
            [addTask_notes, Task_id]
        );

        await connection.execute(
            "UPDATE Task SET Task_owner = ? WHERE Task_id = ?",
            [user.username, Task_id]
        );

        const [appPermitDone] = await connection.query(
            "SELECT App_permit_Done FROM App WHERE App_Acronym = ? ",
            [Task_app_Acronym]
        );

        const appPermitDoneGroup = appPermitDone[0].App_permit_Done;
        if (appPermitDoneGroup) {
            const [users] = await connection.query(
                "SELECT username FROM usergroup WHERE groupname = ?",
                [appPermitDoneGroup]
            );
            const usernames = users.map((user) => user.username);
            const [emails] = await connection.query(
                "SELECT email FROM users WHERE username IN (?) AND status = true",
                [usernames]
            );

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
                    text: `Task ${task.Task_Name} is completed by ${user.username}`,
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
};

module.exports = {
    createTask,
    getTaskByState,
    promoteTask2Done,
};
