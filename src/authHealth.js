'use strict';

// A read-only check, never a test post. Requires the existing openid scope.
// Success verifies token identity, NOT w_member_social or publish permission.
async function checkLinkedInAuth(options = {}) {
  const token = options.token ?? process.env.LINKEDIN_ACCESS_TOKEN;
  const expectedSub = options.expectedSub ?? process.env.LINKEDIN_SUB;
  if (!token || !token.trim() || token.startsWith('=')) {
    throw new Error('LinkedIn access token is missing or malformed; generation skipped');
  }
  let response;
  try {
    response = await (options.fetch || fetch)('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new Error('LinkedIn authentication check unavailable; generation skipped');
  }
  if (!response.ok) {
    throw new Error('LinkedIn authentication check failed (HTTP ' + response.status + '); generation skipped');
  }
  let identity;
  try { identity = await response.json(); } catch {
    throw new Error('LinkedIn authentication check returned invalid data; generation skipped');
  }
  if (typeof identity?.sub !== 'string' || !identity.sub ||
      (expectedSub && identity.sub !== expectedSub)) {
    throw new Error('LinkedIn authentication identity mismatch or missing; generation skipped');
  }
  return { authenticated: true };
}

module.exports = { checkLinkedInAuth };
