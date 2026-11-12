// src/linkedin.js
// LinkedIn REST API publisher with image support.
//
// Post types:
//   publishPost()      - text-only post (backward compatible)
//   publishImagePost() - post with attached image
//
// Image upload flow:
//   1. POST /rest/images?action=initializeUpload -> get uploadUrl + image URN
//   2. PUT binary image to uploadUrl
//   3. Include image URN in the post payload

'use strict';

const axios = require('axios');
const fs = require('fs');

const LINKEDIN_API = 'https://api.linkedin.com';
const LINKEDIN_VERSION = '202608';

async function getAuthorUrn(token) {
  if (process.env.LINKEDIN_SUB) {
    return `urn:li:person:${process.env.LINKEDIN_SUB}`;
  }
  try {
    const res = await axios.get(`${LINKEDIN_API}/v2/userinfo`, {
      headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': LINKEDIN_VERSION },
      timeout: 15000,
    });
    const sub = res.data?.sub;
    if (!sub) throw new Error('No sub in /v2/userinfo response');
    const urn = `urn:li:person:${sub}`;
    console.log(`[linkedin] Author: ${urn}`);
    return urn;
  } catch (err) {
    throw new Error(`Could not resolve LinkedIn author URN: ${err.message}`);
  }
}

async function uploadImage(imagePath, token) {
  const accessToken = token || process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) throw new Error('No LinkedIn access token');
  const authorUrn = await getAuthorUrn(accessToken);

  // Step 1: Initialize upload
  console.log('[linkedin] Initializing image upload...');
  const initRes = await axios.post(
    `${LINKEDIN_API}/rest/images?action=initializeUpload`,
    { initializeUploadRequest: { owner: authorUrn } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 15000,
    }
  );

  const uploadUrl = initRes.data?.value?.uploadUrl;
  const imageUrn = initRes.data?.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new Error('LinkedIn initializeUpload did not return uploadUrl/image: ' + JSON.stringify(initRes.data));
  }
  console.log(`[linkedin] Image URN: ${imageUrn}`);

  // Step 2: PUT binary
  const imageBuffer = fs.readFileSync(imagePath);
  const fileSizeKB = (imageBuffer.length / 1024).toFixed(1);
  console.log(`[linkedin] Uploading image (${fileSizeKB} KB)...`);

  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    timeout: 60000,
    maxContentLength: 10 * 1024 * 1024,
    maxBodyLength:    10 * 1024 * 1024,
  });

  console.log('[linkedin] Image uploaded successfully');
  return imageUrn;
}

// Posts API commentary uses LinkedIn little-text, not raw plain text.
// Escape body syntax, then append validated hashtag elements separately.
function formatCommentary(content, hashtags = []) {
  const body = String(content).replace(/[\\|{}@\[\]()<>#*_~]/g, c => '\\' + c);
  const tags = [...new Set((Array.isArray(hashtags) ? hashtags : [])
    .filter(tag => typeof tag === 'string' && /^#[A-Za-z0-9_]+$/.test(tag)))].slice(0, 3);
  return body + (tags.length ? '\n\n' + tags.join(' ') : '');
}

async function publishImagePost(content, imageUrn, hashtags, token) {
  const accessToken = token || process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) throw new Error('No LinkedIn access token');
  const authorUrn = await getAuthorUrn(accessToken);

  const payload = {
    author: authorUrn,
    commentary: formatCommentary(content, hashtags),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: imageUrn } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  return _doPublish(payload, accessToken);
}

async function publishPost(content, hashtags, token) {
  const accessToken = token || process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) throw new Error('No LinkedIn access token');
  const authorUrn = await getAuthorUrn(accessToken);

  const payload = {
    author: authorUrn,
    commentary: formatCommentary(content, hashtags),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  return _doPublish(payload, accessToken);
}

async function _doPublish(payload, accessToken) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[linkedin] Publish attempt ${attempt}/3`);
      const res = await axios.post(`${LINKEDIN_API}/rest/posts`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeout: 30000,
      });
      const postUrn = res.headers['x-restli-id'] || res.data?.id;
      const postUrl = postUrn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}` : null;
      console.log(`[linkedin] Published: ${postUrn}`);
      if (postUrl) console.log(`[linkedin] URL: ${postUrl}`);
      return { success: true, urn: postUrn, url: postUrl };
    } catch (err) {
      const status = err.response?.status;
      const body = JSON.stringify(err.response?.data || {});
      console.warn(`[linkedin] Attempt ${attempt} failed - HTTP ${status}: ${body}`);
      // A timeout/network error/5xx may follow an accepted post. Do not retry
      // an ambiguous create operation; the owner must reconcile it first.
      if (!status || status >= 500) {
        throw new Error('LinkedIn publish outcome unknown; automatic retry stopped to avoid duplicates');
      }
      if (status === 401 || status === 403) {
        throw new Error(`LinkedIn auth error (${status}). Check token and w_member_social scope. Raw: ${body}`);
      }
      if (attempt === 3) throw new Error(`LinkedIn publish failed after 3 attempts: ${body}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

module.exports = { formatCommentary, publishPost, publishImagePost, uploadImage, getAuthorUrn };

