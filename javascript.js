const getTasksByState = async () => {
    const response = await fetch("http://localhost:3002/GetTaskByState", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: "admin",
            password: "password1!",
            Task_state: "closed",
        }),
    });

    const data = await response.json();
    console.log(data);
};

//getTasksByState();

const createTask = async () => {
    const response = await fetch("http://localhost:3002/CreateTask", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: "admin",
            password: "password1!",
            Task_app_Acronym: "testapp1",
            Task_Name: "New Task",
            Task_description: "Description of the new task",
            Task_plan: "",
        }),
    });

    const data = await response.json();
    console.log(data);
};

//createTask();

const promoteTaskToDone = async () => {
    const task_id = "APP_1"; // Replace with the actual task ID
    const response = await fetch(`http://localhost:3002/PromoteTask2Done`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: "admin",
            password: "password1!",
            Task_id: "test_app_10",
        }),
    });

    const data = await response.json();
    console.log(data);
};

promoteTaskToDone();
