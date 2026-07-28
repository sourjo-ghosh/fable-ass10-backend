const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8000;
// const client = new MongoClient();
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const db = await client.db("fable");
    const allUser = await db.collection("user");
    const allEbook = await db.collection("ebook");
    const bookMarksCollection = await db
      .collection("bookmarks")
      .createIndex({ userId: 1, ebookId: 1 }, { unique: true });
    // For Writer ----------------------------------------------
    app.post("/api/add-ebook", async (req, res) => {
      const ebookData = req.body;
      if (!ebookData) {
        return res.status(400).send("Ebook data is required");
      }
      const result = await allEbook.insertOne(ebookData);
      res.json({
        success: true,
        message: "Ebook data inserted successfully",
        result,
      });
    });


    app.put("/api/edit-ebook/:id", async (req, res) => {
      const { id } = req.params;
      const ebookData = await allEbook.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body },
      );
      if (!ebookData) {
        return res.status(404).send("Ebook not found");
      }
      res.json({
        success: true,
        message: "Ebook data updated successfully",
        data: ebookData,
      });
    });


    app.patch("/api/publish-ebook/:UserId", async (req, res) => {
      const { UserId } = req.params;
      const { id } = req.body;
      const is_real_writer = await allUser.findOne({
        _id: new ObjectId(UserId),
        role: "writer",
      });
      if (!is_real_writer) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to publish this ebook",
        });
      }
      const isAlreadyPublished = await allEbook.findOne({
        _id: new ObjectId(id),
        isPublished: true,
      });
      if (isAlreadyPublished) {
        const UpdateResults = await allEbook.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isPublished: false } },
        );
        return res.json({
          success: true,
          message: "Ebook unpublished successfully",
        });
      }
      const ebookData = await allEbook.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isPublished: true } },
      );
      res.json({ success: true, message: "Ebook published successfully" });
    });


    // For writer -----------------------------------------------------------


    // For Writer and Admin ---------------------------------------------------
    app.get("/api/all-ebook", async (req, res) => {
      // all ebooks including unpublished ones for writer and admin
      const UserEmail = req.query.email;
      const UserId = req.query.id;
      const FilteredEbooks = await allEbook
        .find({
          authorId: UserId,
          authorEmail: UserEmail,
        })
        .toArray();
      res.json({
        success: true,
        message: "Ebook data retrieved successfully",
        data: FilteredEbooks,
      });
    });

    app.delete("/api/delete-ebook/:id", async (req, res) => {
      const { id } = req.params;
      const ebookData = await allEbook.deleteOne({ _id: new ObjectId(id) });
      if (!ebookData) {
        return res.status(404).send("Ebook not found");
      }
      res.json({
        success: true,
        message: "Ebook data deleted successfully",
        data: ebookData,
      });
    });

      

    // For Admin ----------------------------------------------------
    app.get("/api/all-users/:userId", async (req, res) => {
      const { userId } = req.params;
      const isAdmin = await allUser.findOne({
        _id: new ObjectId(userId),
        role: "admin",
      });
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to view all users",
        });
      }
      const cursor = allUser.find({});
      const userData = await cursor.toArray();
      const FilteredAdmin = userData.filter((user) => user.role !== "admin");
      res.json({
        success: true,
        message: "User data retrieved successfully",
        data: FilteredAdmin,
      });
    });

    // Ban or Unban a user (toggle)
    app.patch("/api/ban-user/:adminId", async (req, res) => {
      const { adminId } = req.params;
      const { userId } = req.body;
      // Verify admin
      const isAdmin = await allUser.findOne({
        _id: new ObjectId(adminId),
        role: "admin",
      });
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to ban/unban users",
        });
      }
      // Check current ban status
      const targetUser = await allUser.findOne({ _id: new ObjectId(userId) });
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      const newBanStatus = !targetUser.banned;
      await allUser.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { banned: newBanStatus } },
      );
      res.json({
        success: true,
        message: newBanStatus
          ? "User banned successfully"
          : "User unbanned successfully",
      });
    });

    // Change user role
    app.patch("/api/change-role/:adminId", async (req, res) => {
      const { adminId } = req.params;
      const { userId, role } = req.body;
      // Verify admin
      const isAdmin = await allUser.findOne({
        _id: new ObjectId(adminId),
        role: "admin",
      });
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to change user roles",
        });
      }
      const targetUser = await allUser.findOne({ _id: new ObjectId(userId) });
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      await allUser.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { role } },
      );
      res.json({
        success: true,
        message: `User role changed to ${role} successfully`,
      });
    });


    // For Public ----------------------------------------------------
    app.get("/api/all-ebooks", async (req, res) => {
      // all ebooks only published ones for public
      const cursor = allEbook.find({
        isPublished: true,
      });
      const ebookData = await cursor.toArray();
      res.json({
        success: true,
        message: "Ebook data retrieved successfully",
        data: ebookData,
      });
    });
    // For public single ebook details
    app.get("/api/ebook/:id", async (req, res) => {
      const { id } = req.params;
      const ebookData = await allEbook.findOne({ _id: new ObjectId(id) });
      if (!ebookData) {
        return res.status(404).send("Ebook not found");
      }
      res.json({
        success: true,
        message: "Ebook data retrieved successfully",
        data: ebookData,
      });
    });

    

    // For public bookmark toggle and get bookmarks -------------------------------------
    app.post("/api/toggle-bookmark/:userId", async (req, res) => {
      const { userId } = req.params;
      const { id: ebookId } = req.body;
      const bookMarks = db.collection("bookmarks");
      const existing = await bookMarks.findOne({ userId, ebookId });
      if (!ebookId) {
        return res
          .status(400)
          .json({ success: false, message: "Ebook ID is required" });
      }
      if (existing) {
        await bookMarks.deleteOne({ _id: existing._id });
        return res.json({ success: true, bookmarked: false });
      }
      await bookMarks.insertOne({
        userId,
        ebookId,
        bookmarked: true,
        createdAt: new Date(),
      });
      return res.json({ success: true, bookmarked: true });
    });
    app.get("/api/bookmarks/:userId", async (req, res) => {
      // get all bookmarks for individual user
      const { userId } = req.params;
      console.log(userId);
      const bookMarks = db.collection("bookmarks");
      const ebooks = db.collection("ebook");
      const myBookmarks = await bookMarks
        .find({ userId })
        .sort({ createdAt: -1 })
        .toArray();
      const ebookDetails = await ebooks
        .find({ _id: { $in: myBookmarks.map((b) => new ObjectId(b.ebookId)) } })
        .toArray();

      res.json({
        success: true,
        message: "Bookmarks retrieved successfully",
        data: ebookDetails,
      });
    });
    app.get("/api/check/:userId/:ebookId", async (req, res) => {
      const exists = await db.collection("bookmarks").findOne({
        userId: req.params.userId,
        ebookId: req.params.ebookId,
      });
      res.json({ bookmarked: !!exists });
    });
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  } catch (err) {
    console.dir(err);
  }
}

// Call this only when your application terminates
// async function disconnectFromMongoDB() {
//   await client.close();
// }
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello world");
});
