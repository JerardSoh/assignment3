const express = require("express");
const router = express.Router();
const taskController = require("./taskController");

router.post("/CreateTask", taskController.createTask);
router.post("/GetTaskbyState", taskController.getTaskByState);
router.patch("/PromoteTask2Done", taskController.promoteTask2Done);

module.exports = router;
