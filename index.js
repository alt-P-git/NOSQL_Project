require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const connectDB = require("./db/connect");
const File = require("./models/File");
const fs = require("fs");
const rateLimit = require('express-rate-limit');
const nosqlSanitizer = require('express-nosql-sanitizer');
const { xss } = require('express-xss-sanitizer');
const app = express();

//CLOUD
const { BlobServiceClient } = require('@azure/storage-blob');
const azureConnectionString = process.env.AZURE_CONNECTION_STRING;
const accountName = process.env.ACCOUNT_NAME
const sasToken = process.env.SAS_TOKEN
const containerName = process.env.CONTAINER_NAME

const blobServiceClient = BlobServiceClient.fromConnectionString(azureConnectionString);
const containerClient = blobServiceClient.getContainerClient(containerName)

const uploadFile = async (file) => {
  const blobName = uuidv4();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  console.log('Uploading to Azure storage as blob:', blobName);
  const data = file.data
  const uploadBlobResponse = await blockBlobClient.upload(data, data.length);

  console.log("Blob was uploaded successfully. requestId: ", uploadBlobResponse.requestId);
  return blobName;
}

const options = { deleteSnapshots: "include" };

const deleteUpload = async (blobName) => {
  const blockBlobClient = await containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.delete(options);

  console.log("Deleting blob from Azure storage:", blobName);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(xss());

app.enable('trust proxy')

app.use(cors());
app.options('*', cors());
var allowCrossDomain = function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
}
app.use(allowCrossDomain);

const sendEmailNodeMailer = require("./controllers/sendEmail");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.use(nosqlSanitizer());

app.use(limiter)


app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));
app.use(fileUpload());

app.get("/hello", (req, res) => {
  res.send("Hello World! Server running fine");
});


app.post("/", express.json(), async (req, res) => {

  if (!req.files || !req.files.encryptedFile) {
    return res.status(400).json({ msg: "No file uploaded" });
  }

  const file = req.files.encryptedFile;
  const originalName = req.body.originalName;
  const receiverEmail = req.body.receiverEmail;
  const password = req.body.password;

  const filename = Date.now() + "_" + file.name;
  const uploadPath = __dirname + "/uploads/" + filename;

  try {
    //instead of moving to uploadPath, we will upload to Azure Blob Storage
    // await file.mv(uploadPath);
    const fileId = await uploadFile(file);
    const extension = path.extname(originalName);

    const downloadLink = `http://securesharenosql-thedrbs-projects.vercel.app/download/${fileId}`;

    const newFile = new File({
      fileName: filename,
      originalName: originalName,
      path: uploadPath,
      downloadLink: downloadLink,
      extension: extension,
      password: password,
      receiverEmail: receiverEmail,
    });
    await newFile.save();


    if (receiverEmail) {
      try {
        await sendEmailNodeMailer(receiverEmail, fileId)
      } catch (error) {
        console.log("Error sending email:", error);

        return res.status(500).json({ msg: "Error sending email", error: error.message });
      }
    }


    res
      .status(200)
      .json({ msg: "File uploaded successfully", link: downloadLink, fileId: fileId });
  } catch (err) {
    res
      .status(500)
      .send({ msg: "Error while uploading file", error: err.message });
  }
});


app.get("/download/:id", async (req, res) => {
  try {
    const file = await File.findOne({
      downloadLink: `http://securesharenosql-thedrbs-projects.vercel.app/download/${req.params.id}`,
    });

    const password = req.headers['password'];
    const email = req.headers['email'];

    if ((!file || !file.path || file.password !== password) || (file.receiverEmail && file.receiverEmail !== email)) {
      return res.status(403).send({ msg: "Access denied" });
    }

    const extension = file.extension || "";
    const filename = file.originalName || "downloaded_file" + extension;
    
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`
    );
    
    const blobClient = containerClient.getBlockBlobClient(req.params.id);

    const downloadBlockBlobResponse = await blobClient.download(0);
    downloadBlockBlobResponse.readableStreamBody.pipe(res);
  } catch (err) {
    res.status(500).send({ msg: "Error retrieving file", error: err.message });
  }


  //after download, delete the blob
  await deleteUpload(req.params.id);
});

app.post("/send", express.json(), async (req, res) => {

  const { receiverEmail, fileID, senderName } = req.query;
  try {
    await sendEmailMailjet(receiverEmail, fileID, senderName);
    res.status(200).json({ msg: "Email sent successfully" });
  } catch (error) {
    console.error("Email error", error);
    res.status(500).json({ error: error.message });
  }
});


const port = process.env.PORT || 4000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () => {
      console.log("Server is listening on port " + port);
    });
  } catch (error) {
    console.log(error);
  }
};

start();