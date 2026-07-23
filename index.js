const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const port = 8000;
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
    // const allEbookCollection = await allEbook.find({}).toArray();
    console.log(allUser);
    console.log(allEbook);
    console.log("You successfully connected to MongoDB!");
    app.get("/", (req, res) => {
      res.send(allUser);
    });
    app.post("/api/add-ebook", async (req, res) => {
      const ebookData = req.body;
      if (!ebookData) {
        return res.status(400).send("Ebook data is required");
      }
      const result = await allEbook.insertOne(ebookData);
      res.json({ success: true, message: "Ebook data inserted successfully", result });
      console.log(result);
    });
    app.get("/api/all-ebook", async (req, res) => {
      const ebookData = await allEbook.find({}).toArray();
      res.json({ success: true, message: "Ebook data retrieved successfully", result: ebookData });
      // console.log(result);
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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
