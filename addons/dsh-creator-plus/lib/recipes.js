/**
 * Recipes (build prompt, part 5): one per kind of plugin, drawn from how the plugins here are built
 * (docs/CREATOR-PLUS-HANDBOOK.md). Steps are marked "must" (every model follows them) or "default" (what a
 * small model does; a model the user marked as strong may replace a default with something better if it
 * writes its reason down and every check still passes). Shipped recipes are in the add-on's recipes/ folder;
 * a recipe the user approved a change to (learning, part 8) lives in Creator Plus's own folder and wins.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const KINDS = ['tool', 'mode', 'panel', 'theme', 'automation', 'provider'];

/** @returns {object | undefined} a recipe file, checked. */
function readRecipe(path) {
  try {
    const recipe = JSON.parse(readFileSync(path, 'utf8'));
    if (!KINDS.includes(recipe?.kind) || !Array.isArray(recipe.steps)) return undefined;
    const steps = recipe.steps.filter((step) => step && typeof step.id === 'string' && typeof step.text === 'string' && (step.mark === 'must' || step.mark === 'default')).slice(0, 40);
    return { kind: recipe.kind, label: String(recipe.label ?? recipe.kind), when: String(recipe.when ?? ''), files: Array.isArray(recipe.files) ? recipe.files.map(String) : [], steps, checks: Array.isArray(recipe.checks) ? recipe.checks.map(String) : ['load', 'tests', 'fit', 'trial'] };
  } catch {
    return undefined;
  }
}

/**
 * The recipes: shipped ones, each replaced by the user's approved version when there is one.
 * @param {string} shipped - the add-on's recipes/ folder.
 * @param {string} [own] - Creator Plus's own recipes folder.
 * @returns {Record<string, object>} kind → recipe.
 */
export function loadRecipes(shipped, own = '') {
  const out = {};
  for (const dir of [shipped, own].filter(Boolean)) {
    let names = [];
    try {
      names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    } catch {
      names = [];
    }
    for (const name of names) {
      const recipe = readRecipe(join(dir, name));
      if (recipe) out[recipe.kind] = { ...recipe, from: dir === shipped ? 'shipped' : 'yours' };
    }
  }
  return out;
}

/**
 * A recipe as a model reads it.
 * @param {object} recipe - from loadRecipes.
 * @param {{strong?: boolean}} [options] - whether the conversation's model is one the user marked strong.
 * @returns {string} the steps, numbered, with their marks.
 */
export function recipeText(recipe, { strong = false } = {}) {
  const lines = [`Recipe: ${recipe.label} (${recipe.kind}). Use it when: ${recipe.when}`, `Files: ${recipe.files.join(', ')}.`, ''];
  recipe.steps.forEach((step, index) => lines.push(`${index + 1}. [${step.mark}] ${step.text}`));
  lines.push('', strong
    ? 'You run on a model the user marked as strong: you may replace a [default] step with something better. Write the reason down in your report; every check must still pass. [must] steps are for every model.'
    : 'Follow every step in order. [must] and [default] steps are both yours to do.');
  lines.push(`Checks, in this order: ${recipe.checks.join(', ')} (creator_check runs them).`);
  return lines.join('\n');
}
