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
    const db = client.db("fable");
    const allUser = db.collection("user");
    const allEbook = db.collection("ebook");
    const paymentCollection = db.collection("payment");
    // For Writer ----------------------------------------------
    app.post("/api/add-ebook", async (req, res) => {
      const { bookData, userId } = req.body;
      const is_real_writer = await allUser.findOne({
        _id: new ObjectId(userId),
        role: "writer",
      });
      if (!is_real_writer) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to add an ebook",
        });
      }
      const IsVerifiedWriter = await allUser.findOne({
        _id: new ObjectId(userId),
        emailVerified: true,
      });
      if (!IsVerifiedWriter) {
        return res.status(403).json({
          success: false,
          message:
            "You are not a verified writer. Please verify your account to add an ebook.",
        });
      }
      const isAlreadyExists = await allEbook.findOne({
        title: bookData.title,
        authorId: userId,
      });
      if (isAlreadyExists) {
        return res.status(400).json({
          success: false,
          message: "An ebook with this title already exists",
        });
      }
      if (!bookData) {
        return res.status(400).send("Ebook data is required");
      }
      const result = await allEbook.insertOne(bookData);
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
    app.get("/api/user/purchased-books/:userId", async (req, res) => {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }
      const payments = await paymentCollection
        .find({
          userId: userId,
          paymentStatus: "paid",
        })
        .toArray();
      const results = [];
      for (const payment of payments) {
        const ebook = await allEbook.findOne({
          _id: new ObjectId(payment.ebookId),
        });
        if (ebook) {
          results.push({
            _id: ebook._id,
            coverImage: ebook.coverImage,
            ebookTitle: ebook.title,
          });
        }
      }
      res.json({
        success: true,
        message: "Purchased books retrieved successfully",
        data: results,
      });
    });
    app.get("/api/user/purchased-history/:userId", async (req, res) => {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }
      const payments = await paymentCollection
        .find({
          userId: userId,
          paymentStatus: "paid",
        })
        .sort({ createdAt: -1 })
        .toArray();
      const history = [];
      for (const payment of payments) {
        const ebook = await allEbook.findOne({
          _id: new ObjectId(payment.ebookId),
        });
        if (ebook) {
          history.push({
            _id: ebook._id,
            title: ebook.title,
            author: ebook.authorName,
            price: ebook.price,
            date: payment.createdAt,
            status: payment.paymentStatus,
            coverImage: ebook.coverImage,
            ebookTitle: ebook.title,
          });
        }
      }
      res.json({
        success: true,
        message: "Purchased books retrieved successfully",
        data: history,
      });
    });
    // For writer -----------------------------------------------------------

    // For Writer and Admin ---------------------------------------------------
    app.get("/api/all-ebook", async (req, res) => {
      // all ebooks including unpublished ones for writer
      const UserEmail = req.query.email;
      const UserId = req.query.id;
      const isWriter = await allUser.findOne({
        _id: new ObjectId(UserId),
        email: UserEmail,
        role: "writer",
      });
      if (!isWriter) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to view this data",
        });
      }
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
    app.get("/api/writer/sales-history/:userId", async (req, res) => {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }
      const isWriter = await allUser.findOne({
        _id: new ObjectId(userId),
        role: "writer",
      });
      if (!isWriter) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to view sales history",
        });
      }
      const writerEbooks = await allEbook
        .find({
          authorId: userId,
        })
        .toArray();
      const writerEbookIds = writerEbooks.map((ebook) => ebook._id.toString());
      const sales = await paymentCollection
        .find({
          ebookId: { $in: writerEbookIds },
          paymentStatus: "paid",
        })
        .sort({ createdAt: -1 })
        .toArray();
      const history = [];
      for (const sale of sales) {
        const originalEbook = writerEbooks.find(
          (ebook) => ebook._id.toString() === sale.ebookId,
        );
        const buyer = await allUser.findOne({ _id: new ObjectId(sale.userId) });
        if (originalEbook) {
          history.push({
            id: originalEbook._id,
            title: originalEbook.title,
            buyer: buyer.name,
            date: sale.createdAt,
            amount: sale.amount,
          });
        }
      }
      res.json({
        success: true,
        message: "Purchased books retrieved successfully",
        data: history,
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

    // a specific api for admin only
    app.get("/api/admin/manage-ebook/:adminId", async (req, res) => {
      const { adminId } = req.params;
      const isAdmin = await allUser.findOne({
        _id: new ObjectId(adminId),
        role: "admin",
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
      const isAdmin = await allUser.findOne({
        _id: new ObjectId(adminId),
      });
      if (!isAdmin) {
        return {
          success: false,
          message: "You are not authorized for this action ",
        };
      }
      const alreadyPurchased = await allEbook.findOne({
        _id: new ObjectId(ebookId),
        isPurchased: true,
      });
      const isAlreadyPublished = await allEbook.findOne({
        _id: new ObjectId(ebookId),
        status: "sold",
      });
      if (alreadyPurchased) {
        return res.json({
          success: false,
          message:
            "This ebook has already been purchased and cannot be unpublished",
        });
      }
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
      const isAdmin = await allUser.findOne({
        _id: new ObjectId(adminId),
      });
      if (!isAdmin) {
        return {
          success: false,
          message: "You are not authorized for this action ",
        };
      }
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

    app.get("/api/admin/all-transactions/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const isAdmin = await allUser.findOne({
          _id: new ObjectId(userId),
          role: "admin",
        });
        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized for this action",
          });
        }
        const transactions = await paymentCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        const resultList = [];

        for (const tx of transactions) {
          const account = await allUser.findOne({
            _id: new ObjectId(tx.userId),
          });

          resultList.push({
            id: tx.paymentIntentId,
            type: tx.paymentType || "purchase",
            email: account ? account.email : "Unknown Account",
            amount: tx.amount ? (tx.amount / 100).toFixed(2) : "0.00",
            date: tx.createdAt,
          });
        }

        res.json({ success: true, data: resultList });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    app.get("/api/admin/analytics-overview/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const isAdmin = await allUser.findOne({
          _id: new ObjectId(userId),
          role: "admin",
        });

        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized to view admin analytics",
          });
        }

        const totalUsers = await allUser.countDocuments({ role: "reader" });
        const totalWriters = await allUser.countDocuments({ role: "writer" });


        const totalEbooksSold = await paymentCollection.countDocuments({
          paymentType: "ebook_purchase",
        });

        const successfulPayments = await paymentCollection
          .find({
            paymentStatus: "paid",
          })
          .toArray();

        let totalRevenueCents = 0;

        for (const payment of successfulPayments) {
          totalRevenueCents += payment.amount || 0;
        }

        const totalRevenue = (totalRevenueCents / 100).toFixed(2);

        res.json({
          success: true,
          message: "Admin analytics data retrieved successfully",
          data: {
            totalUsers,
            totalWriters,
            totalEbooksSold,
            totalRevenue,
          },
        });
      } catch (err) {
        console.error("Admin analytics error:", err);
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // For Public ----------------------------------------------------
    app.get("/api/all-ebooks", async (req, res) => {
      // all ebooks only published ones for public
      const cursor = allEbook.find(
        { isPublished: true },
        { projection: { content: 0 } },
      );
      const ebookData = await cursor.toArray();
      res.json({
        success: true,
        message: "Ebook data retrieved successfully",
        data: ebookData,
      });
    });
    // For public single ebook details
    app.get("/api/ebook/:id/:userId", async (req, res) => {
      try {
        const { id, userId } = req.params;

        // 1. Fetch the ebook from the database
        const ebook = await allEbook.findOne({
          _id: new ObjectId(id),
        });

        if (!ebook) {
          return res.status(404).json({
            success: false,
            message: "Ebook not found",
          });
        }
        if (ebook.authorId?.toString() === userId?.toString()) {
          return res.json({
            success: true,
            isPurchased: true, // Frontend treats them as an authorized reader
            data: ebook, // Full data containing the premium content
          });
        }
        // 2. Safely check if the user has a completed payment for this book
        // Using string matching or ObjectId matching based on your database storage schema
        const purchased = await paymentCollection.findOne({
          userId: userId,
          ebookId: id,
          paymentStatus: "paid",
        });

        // 3. Handle the payload distribution conditionally
        if (purchased) {
          // User paid: Send the full data including sensitive reading material
          return res.json({
            success: true,
            isPurchased: true,
            data: ebook,
          });
        }

        const { content, ...preview } = ebook;

        return res.json({
          success: true,
          isPurchased: false,
          data: preview, // Sends everything EXCEPT the content field
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
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
      const IsAdmin = await allUser.findOne({ _id: { userId } });
      if (IsAdmin) {
        return res.json({
          success: false,
          message: "You can't do this actions",
        });
      }
      if (existing) {
        await bookMarks.deleteOne({ _id: existing._id });
        return res.json({
          success: true,
          bookmarked: false,
          message: "BookMark removed",
        });
      }
      await bookMarks.insertOne({
        userId,
        ebookId,
        bookmarked: true,
        createdAt: new Date(),
      });
      return res.json({
        success: true,
        bookmarked: true,
        message: "BookMark added",
      });
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
        if (product.status === "sold") {
          return res.status(400).json({
            success: false,
            message: "This ebook is sold out",
          });
        }
        const user = await allUser.findOne({
          _id: new ObjectId(userId),
        });

        if (user && (user.role === "admin" || user.role === "writer")) {
          return res.status(403).json({
            success: false,
            message: "Creators Cannot Buy",
          });
        }
        if (product.authorId?.toString() === userId?.toString()) {
          return res.status(403).json({
            success: false,
            message: "You cannot purchase your own book",
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
            paymentType: "ebook_purchase",
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
    app.post("/api/verify-writer", async (req, res) => {
      try {
        const { userId } = req.body;
        console.log("User ID:", userId);
        // find the product form allEbook collection
        const user = await allUser.findOne({
          _id: new ObjectId(userId),
        });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }
        if (user.role !== "writer") {
          return res.status(403).json({
            success: false,
            message: "Only writers can perform this action",
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
                  name: "Writer Verification Fee",
                },

                unit_amount: 10 * 100,
              },

              quantity: 1,
            },
          ],

          success_url: `${process.env.CLIENT_URL}/dashboard/my-profile`,
          cancel_url: `${process.env.CLIENT_URL}/dashboard/my-profile/`,
          metadata: {
            userId,
            paymentType: "writer_verification",
          },
        });

        res.json({
          success: true,
          url: session.url,
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
      console.log("========== WEBHOOK ==========");
      console.log(req.body);
      console.log("=============================");
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        if (session.metadata.paymentType === "ebook_purchase") {
          // ebook purchase logic
          const paymentInfo = {
            userId: session.metadata.userId,
            ebookId: session.metadata.ebookId,

            paymentIntentId: session.payment_intent,
            checkoutSessionId: session.id,

            amount: session.amount_total,
            currency: session.currency,

            paymentStatus: session.payment_status,

            paymentType: session.metadata.paymentType,

            createdAt: new Date(),
          };
          const markEbookSold = await allEbook.updateOne(
            { _id: new ObjectId(session.metadata.ebookId) },
            { $set: { status: "sold" } },
          );
          await paymentCollection.insertOne(paymentInfo);
        }
        if (session.metadata.paymentType === "writer_verification") {
          // writer verification logic
          const paymentInfo = {
            userId: session.metadata.userId,

            paymentIntentId: session.payment_intent,
            checkoutSessionId: session.id,

            amount: session.amount_total,
            currency: session.currency,

            paymentStatus: session.payment_status,

            paymentType: session.metadata.paymentType,

            createdAt: new Date(),
          };

          // Payment history save
          await paymentCollection.insertOne(paymentInfo);

          await allUser.updateOne(
            {
              _id: new ObjectId(session.metadata.userId),
            },
            { $set: { emailVerified: true } },
          );
        }
      }

      res.sendStatus(200);
    });
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  } catch (err) {
    console.dir(err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello world");
});
