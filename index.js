const { MongoClient, ServerApiVersion } = require("mongodb");
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const port = 3001;
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
    const allUser = await db.collection("user").find().toArray();
    console.log(allUser);
    console.log("You successfully connected to MongoDB!");
    app.get("/", (req, res) => {
      res.send(allUser);
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
