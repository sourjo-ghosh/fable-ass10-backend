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
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
    const paymentCollection = db.collection("payment");
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
      // all ebooks including unpublished ones for writer
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
    app.get("/api/admin/all-users/:userId", async (req, res) => {
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
    app.patch("/api/admin/ban-user/:adminId", async (req, res) => {
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
      if (targetUser.isBanned) {
        const UnBan = await allUser.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { isBanned: false } },
        );
        return res.json({
          success: true,
          message: "User UnBanned successfully",
        });
      }
      const newBanStatus = !targetUser.isBanned;
      await allUser.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { isBanned: true } },
      );
      await db.collection("session").deleteMany({ userId: targetUser });
      res.json({
        success: true,
        message: "User banned successfully",
      });
    });

    // Change user role
    app.patch("/api/admin/change-role/:adminId", async (req, res) => {
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

    // a specific api for admin only
    app.get("/api/admin/manage-ebook/:adminId", async (req, res) => {
      const { adminId } = req.params;
      const isAdmin = allUser.findOne({
        _id: new ObjectId(adminId),
      });
      if (!isAdmin) {
        return {
          success: false,
          message: "You are not authorized for this action ",
        };
      }
      // const allEbooks = await allEbook;
      const allEbooks = await allEbook.find({}).toArray();
      res.json({
        success: true,
        message: "Ebook data retrieved successfully",
        data: allEbooks,
      });
    });
    app.patch("/api/admin/manage-ebook/publish-unpublish", async (req, res) => {
      const { ebookId, adminId } = req.body;
      // const {adminId} = req.params;
      const isAdmin = allUser.findOne({
        _id: new ObjectId(adminId),
      });
      if (!isAdmin) {
        return {
          success: false,
          message: "You are not authorized for this action ",
        };
      }
      const isAlreadyPublished = await allEbook.findOne({
        _id: new ObjectId(ebookId),
        isPublished: true,
      });
      if (isAlreadyPublished) {
        const UpdateResults = await allEbook.updateOne(
          { _id: new ObjectId(ebookId) },
          { $set: { isPublished: false } },
        );
        return res.json({
          success: true,
          message: "Ebook unpublished successfully",
        });
      }
      const ebookData = await allEbook.updateOne(
        { _id: new ObjectId(ebookId) },
        { $set: { isPublished: true } },
      );
      res.json({
        success: true,
        message: "Ebook data retrieved successfully",
        data: ebookData,
      });
    });

    app.delete("/api/admin/manage-ebook/delete", async (req, res) => {
      const { id: ebookId, adminId } = req.body;
      const ebookData = await allEbook.deleteOne({
        _id: new ObjectId(ebookId),
      });
      if (!ebookData) {
        return res.status(404).send("Ebook not found");
      }
      res.json({
        success: true,
        message: "Ebook data deleted successfully",
        data: ebookData,
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
    // payments
    app.post("/api/create-checkout-session", async (req, res) => {
      try {
        const { ebookId, userId } = req.body;

        // find the product form allEbook collection
        const product = await allEbook.findOne({
          _id: new ObjectId(ebookId),
        });

        if (!product) {
          return res.status(404).json({
            success: false,
            message: "Product not found",
          });
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",

          payment_method_types: ["card"],

          line_items: [
            {
              price_data: {
                currency: "usd",

                product_data: {
                  name: product.title,
                },

                unit_amount: product.price * 100,
              },

              quantity: 1,
            },
          ],

          success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/payment-cancel?ebookId=${ebookId}`,

          metadata: {
            ebookId,
            userId,
          },
        });

        res.json({
          success: true,
          url: session.url,
          session: session,
        });
      } catch (err) {
        console.error(err);

        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });
    app.post("/api/stripe/webhook", async (req, res) => {
      const event = req.body;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const paymentInfo = {
          userId: session.metadata.userId,
          ebookId: session.metadata.ebookId,

          paymentIntentId: session.payment_intent,
          checkoutSessionId: session.id,

          amount: session.amount_total,
          currency: session.currency,

          paymentStatus: session.payment_status,

          createdAt: new Date(),
        };

        await paymentCollection.insertOne(paymentInfo);
      }

      res.sendStatus(200);
    });
    app.get("/api/payment-success/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;

        const payment = await paymentCollection.findOne({
          checkoutSessionId: sessionId,
        });

        if (!payment) {
          return res.status(404).send({
            success: false,
            message: "Payment not found",
          });
        }

        const ebook = await allEbook.findOne({
          _id: new ObjectId(payment.ebookId),
        });

        if (!ebook) {
          return res.status(404).send({
            success: false,
            message: "Ebook not found",
          });
        }

        return res.send({
          success: true,
          payment: {
            amount: payment.amount,
            currency: payment.currency,
            status: payment.paymentStatus,
            paymentIntentId: payment.paymentIntentId,
            checkoutSessionId: payment.checkoutSessionId,
            createdAt: payment.createdAt,
          },
          ebook,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Internal Server Error",
        });
      }
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
