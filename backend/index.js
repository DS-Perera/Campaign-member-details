const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
require("dotenv").config();
const nodemailer = require("nodemailer");

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// File paths
const dataFilePath = path.join(__dirname, "userData.json");
const communitiesFilePath = path.join(__dirname, "communitiesList.json");
const usersFilePath = path.join(__dirname, "userList.json");
const emailListPath = path.join(__dirname, "emailList.json");

// Ensure data files exist
if (!fs.existsSync(dataFilePath)) {
  fs.writeFileSync(dataFilePath, JSON.stringify([]));
}

if (!fs.existsSync(communitiesFilePath)) {
  fs.writeFileSync(communitiesFilePath, JSON.stringify([]));
}

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  try {
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    const user = users.find(
      (u) => u.username === username && u.password === password
    );

    if (user) {
      console.log(
        `User Logged In: ${username}, Role: ${
          user.role
        }, Time: ${require("moment-timezone")
          .tz("Asia/Colombo")
          .format("YYYY-MM-DD HH:mm:ss")}`
      );

      res.status(200).json({ role: user.role, message: "Login successful" });
    } else {
      console.log(`Failed Login Attempt: ${username}`);
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/update-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  if (!username || !oldPassword || !newPassword) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    const userIndex = users.findIndex(
      (user) => user.username === username && user.password === oldPassword
    );

    if (userIndex === -1) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    users[userIndex].password = newPassword;
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all users
app.get("/users", (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    // Do not send passwords in the response for security reasons
    const usersWithoutPasswords = users.map(({ password, ...rest }) => rest);
    res.status(200).json(usersWithoutPasswords);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Save form data
app.post("/submit", (req, res) => {
  const formData = req.body;

  // Validate NIC field
  if (!formData || !formData.nic) {
    return res.status(400).json({ message: "NIC is required." });
  }

  try {
    // Read existing data from the database (file)
    const existingData = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));

    // Check for duplicate NIC
    const duplicateNIC = existingData.some(
      (data) =>
        data.nic.trim().toLowerCase() === formData.nic.trim().toLowerCase()
    );

    if (duplicateNIC) {
      return res
        .status(409)
        .json({ message: "NIC already exists. Submission rejected." });
    }

    // Generate a Graduation ID
    const nextIdNum = (existingData.length + 1).toString().padStart(5, "0");

    // formData.graduationId = nextId;

    console.log("Data saved " + nextIdNum);

    function generateNextId(formData, nextIdNum) {
      const regionPrefix =
        formData.region?.sub?.substring(0, 2).toUpperCase() || "XX";
      const gsPrefix =
        formData.gsDivision?.value?.substring(0, 2).toUpperCase() || "XX";
      return `${regionPrefix}-${gsPrefix}-${nextIdNum}`;
    }

    formData.RegID = generateNextId(formData, nextIdNum);

    console.log(formData.RegID);
    existingData.push(formData);

    fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2));

    res.status(200).json({
      message: "Form data saved successfully.",
      graduationId: nextIdNum,
    });
  } catch (err) {
    console.error("Error saving data:", err);
    res.status(500).json({ message: "Failed to save form data." });
  }
});

// Get submitted data
app.get("/data", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to read data" });
  }
});

// Get all communities
app.get("/communities", (req, res) => {
  try {
    const communities = JSON.parse(
      fs.readFileSync(communitiesFilePath, "utf8")
    );
    res.status(200).json(communities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to read communities data" });
  }
});

// Add a new community
app.post("/communities", (req, res) => {
  const community = req.body;

  if (
    !community ||
    !community.name ||
    !community.gsDivision ||
    !community.agaDivision
  ) {
    return res.status(400).json({ message: "Invalid community data" });
  }

  try {
    const communities = JSON.parse(
      fs.readFileSync(communitiesFilePath, "utf8")
    );
    communities.push(community);
    fs.writeFileSync(communitiesFilePath, JSON.stringify(communities, null, 2));
    res.status(201).json({ message: "Community added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add community" });
  }
});

// Update a community
app.put("/communities/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const updatedCommunity = req.body;

  try {
    const communities = JSON.parse(
      fs.readFileSync(communitiesFilePath, "utf8")
    );
    const index = communities.findIndex((_, idx) => idx === id);

    if (index === -1) {
      return res.status(404).json({ message: "Community not found" });
    }

    communities[index] = updatedCommunity;
    fs.writeFileSync(communitiesFilePath, JSON.stringify(communities, null, 2));
    res.status(200).json({ message: "Community updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update community" });
  }
});

// Delete a community
app.delete("/communities/:id", (req, res) => {
  const id = parseInt(req.params.id);

  try {
    let communities = JSON.parse(fs.readFileSync(communitiesFilePath, "utf8"));
    communities = communities.filter((_, idx) => idx !== id);
    fs.writeFileSync(communitiesFilePath, JSON.stringify(communities, null, 2));
    res.status(200).json({ message: "Community deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete community" });
  }
});

// Helper function to read emailList from file
const getEmailList = () => {
  try {
    const data = fs.readFileSync(emailListPath, "utf8");
    return JSON.parse(data).emails;
  } catch (error) {
    console.error("Error reading emailList.json:", error);
    return [];
  }
};

// Get the current time in Sri Lankan time zone
const now = DateTime.now().setZone("Asia/Colombo").toFormat("cccc, HH:mm");

var Day = "Tuesday";
var Time = "17:50";

// Helper function to write emailList to file
const updateEmailList = (emails) => {
  try {
    fs.writeFileSync(
      emailListPath,
      JSON.stringify({ emails }, null, 2),
      "utf8"
    );
    return true;
  } catch (error) {
    console.error("Error writing to emailList.json:", error);
    return false;
  }
};

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const timeChecker = () => {
  // console.log(DateTime.now().setZone("Asia/Colombo").toFormat("cccc, HH:mm"));
  const t = DateTime.now().setZone("Asia/Colombo").toFormat("cccc, HH:mm");
  // console.log(Day + ",-" + Time);
  if (t === Day + ", " + Time) {
    console.log("first");
    const emailList = getEmailList();
    sendEmailWithAttachments(emailList); // Call the email function
  }
  // if (
  //   'Day + ", " + Time' ===
  //   DateTime.now().setZone("Asia/Colombo").toFormat("cccc, HH:mm")
  // ) {
  //   console.log("first");
  // }
};

const sendEmailWithAttachments = async (emailList) => {
  try {
    for (const email of emailList) {
      const mailOptions = {
        from: `"Database Backup" <${process.env.SMTP_USER}>`, // Sender address
        to: email, // Current recipient email
        subject: `Database backup of ${new Date().toISOString().split("T")[0]}`,
        text: "Please find the attached files below.",
        attachments: [
          {
            filename: "communitiesList.json", // File 1
            path: path.join(__dirname, "communitiesList.json"),
            contentType: "application/json",
          },
          {
            filename: "userData.json", // File 2
            path: path.join(__dirname, "userData.json"),
            contentType: "application/json",
          },
          {
            filename: "userList.json", // File 3
            path: path.join(__dirname, "userList.json"),
            contentType: "application/json",
          },
          {
            filename: "emailList.json", // File 3
            path: path.join(__dirname, "emailList.json"),
            contentType: "application/json",
          },
        ],
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email}: ${info.messageId}`);
    }
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

// API to get the current schedule
app.get("/getTime", (req, res) => {
  res.json({ Day, Time });
});

// Backup Now API
app.get("/backupNow", async (req, res) => {
  try {
    const emailList = getEmailList();
    await sendEmailWithAttachments(emailList); // Call the email function
    res
      .status(200)
      .json({ success: true, message: "Backup emails sent successfully!" });
  } catch (error) {
    console.error("Error during backup:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to send backup emails." });
  }
});

// Schedule Backup route
app.post("/scheduleBackup", (req, res) => {
  const { day, time } = req.body;

  // Validate the received data
  if (!day || !time) {
    return res.status(400).json({ success: false, message: "Invalid data" });
  }
  Day = day;
  Time = time;
  // Log the scheduled backup details and the current time
  console.log(`Backup scheduled for ${day} at ${time}`);
  // console.log(`Current Sri Lankan time: ${now}`);

  // Respond with success
  res.status(200).json({
    success: true,
    message: "Backup scheduled successfully!",
    currentTime: now, // Return the current time as part of the response
  });
});

// View Email List API
app.get("/emailList", (req, res) => {
  try {
    const emailList = getEmailList();
    res.status(200).json({ success: true, emailList });
  } catch (error) {
    console.error("Error fetching email list:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch email list." });
  }
});

// Edit Email List API (Add/Remove Email)
app.post("/emailList", (req, res) => {
  const { action, email } = req.body;

  if (!action || !email) {
    return res
      .status(400)
      .json({ success: false, message: "Action and email are required." });
  }

  try {
    let emailList = getEmailList();

    if (action === "add") {
      if (emailList.includes(email)) {
        return res
          .status(400)
          .json({ success: false, message: "Email already exists." });
      }
      emailList.push(email);
    } else if (action === "remove") {
      if (!emailList.includes(email)) {
        return res
          .status(400)
          .json({ success: false, message: "Email not found." });
      }
      emailList = emailList.filter((e) => e !== email);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'add' or 'remove'.",
      });
    }

    if (updateEmailList(emailList)) {
      res.status(200).json({
        success: true,
        message: "Email list updated successfully.",
        emailList,
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to update email list." });
    }
  } catch (error) {
    console.error("Error updating email list:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update email list." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  // Print "text" every 60 seconds
  setInterval(() => {
    // console.log(Day + " + " + Time);
    timeChecker();
  }, 60000); // 60000 milliseconds = 60 seconds
});
