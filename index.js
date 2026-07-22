const  {MongoClient} = require ('mongodb'); 
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);


const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const app = express()
const port = 3001


const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

// Call this only when your application terminates
async function disconnectFromMongoDB() {
  await client.close();
}

connectToMongoDB().catch(console.dir);
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})