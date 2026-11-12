'use strict';

// Railway configuration takes precedence. Empty values use safe defaults.
// Explicitly empty OPENROUTER_FALLBACK_MODELS disables fallback models.
function getModels(env = process.env) {
  const primary = (env.OPENROUTER_MODEL || '').trim() || 'anthropic/claude-haiku-4.5';
  const fallback = env.OPENROUTER_FALLBACK_MODELS === undefined
    ? 'anthropic/claude-haiku-4.5'
    : env.OPENROUTER_FALLBACK_MODELS;
  const models = [...new Set([primary, ...fallback.split(',').map(x => x.trim())].filter(Boolean))];
  if (models.length > 3) throw new Error('Configure at most three distinct OpenRouter models');
  for (const model of models) {
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:~+-]+$/.test(model)) {
      throw new Error('Invalid OpenRouter model identifier');
    }
  }
  return models;
}

module.exports = { getModels };
