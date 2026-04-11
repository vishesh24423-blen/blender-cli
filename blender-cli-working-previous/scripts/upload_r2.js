/* eslint-disable @typescript-eslint/no-require-imports */
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

const CONTENT_TYPES = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  fbx: 'application/octet-stream',
  stl: 'model/stl',
  obj: 'text/plain',
  usd: 'application/octet-stream',
  usdc: 'application/octet-stream',
};

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  }
});

async function uploadToR2(filePath, r2Key, fmt) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: r2Key,
    Body: fs.readFileSync(filePath),
    ContentType: CONTENT_TYPES[fmt] || 'application/octet-stream',
  }));
}

async function getSignedUrl(r2Key) {
  return await awsGetSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: r2Key,
    }),
    { expiresIn: 86400 } // 24 hours
  );
}

module.exports = { uploadToR2, getSignedUrl };
