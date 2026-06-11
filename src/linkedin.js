// src/linkedin.js
// LinkedIn REST API publisher
// Uses /rest/posts (v202506) with proper versioning headers.

'use strict';

const axios = require('axios');

const LINKEDIN_API = 'https://api.linkedin.com';
const LINKEDIN_VERSION = '202506';

async function getAuthorUrn(token) {
  // Shortcut: set LINKEDIN_SUB env var to skip this API call every day
  if (process.env.LINKEDIN_SUB) {
    return `urn:li:person:${process.env.LINKEDIN_SUB}`;
  }
  try {
    const res = await axios.get(`${LINKEDIN_API}/v2/userinfo`, {
      headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': LINKEDIN_VERSION },
      timeout: 15_000,
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

async function publishPost(content, hashtags = [], token = null) {
  const accessToken = token || process.env.LINKEDIN_ACCESS_TOKEN;
  if (!accessToken) throw new Error('No LinkedIn access token available');

  const authorUrn = await getAuthorUrn(accessToken);
  const hashtagLine = hashtags.length > 0 ? '\n\n' + hashtags.slice(0, 5).join(' ') : '';

  const payload = {
    author: authorUrn,
    commentary: content + hashtagLine,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

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
        timeout: 30_000,
      });
      const postUrn = res.headers['x-restli-id'] || res.data?.id;
      const postUrl = postUrn
        ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`
        : null;
      console.log(`[linkedin] Published: ${postUrn}`);
      if (postUrl) console.log(`[linkedin] URL: ${postUrl}`);
      return { success: true, urn: postUrn, url: postUrl };
    } catch (err) {
      const status = err.response?.status;
      const body = JSON.stringify(err.response?.data || {});
      console.warn(`[linkedin] Attempt ${attempt} failed - HTTP ${status}: ${body}`);
      // Auth errors will not self-heal - fail immediately
      if (status === 401 || status === 403) {
        throw new Error(
          `LinkedIn auth error (${status}). Check: token not expired, w_member_social scope present, LinkedIn-Version header format YYYYMM. Raw: ${body}`
        );
      }
      if (attempt === 3) throw new Error(`LinkedIn publish failed after 3 attempts: ${body}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

module.exports = { publishPost, getAuthorUrn };
