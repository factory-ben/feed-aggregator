#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const { parseArgs } = require('../_lib/cli');

const DEFAULT_MODEL = process.env.MODEL_ID || process.env.GLM_MODEL_ID || 'glm-4.6';
const DEFAULT_REASONING = process.env.MODEL_REASONING || process.env.GLM_REASONING || 'low';
const DEFAULT_MAX_BATCH = parseInt(process.env.CLASSIFIER_MAX_BATCH || '10', 10);

function stripAnsi(input = '') {
  return input.replace(/\u001B\[[0-9;?]*[ -\/]*[@-~]/g, '');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function buildPrompt(items) {
  const payload = items.map(item => ({
    id: item.id,
    source: item.source,
    author: item.author,
    content: (item.content || '').slice(0, 800),
  }));

  return `You are a precise classifier for Factory's social feed. For each post you must label it as one of: mention, bug, love, question, other.

Definitions:
- mention: Factory is referenced but no action needed.
- bug: user reports an issue, blocker, or something broken.
- love: positive sentiment or praise for Factory.
- question: explicit question for Factory or about the product.
- other: none of the above categories apply.

Return JSON ONLY in this schema:
{"items":[{"id":"id","label":"mention|bug|love|question|other","confidence":0-1,"reason":"short justification"}]}
Never add markdown or prose outside that JSON.

Posts:
${JSON.stringify(payload, null, 2)}
`;
}

function runDroid(prompt, { model = DEFAULT_MODEL, reasoning = DEFAULT_REASONING }) {
  return new Promise((resolve, reject) => {
    const args = ['exec', '--output-format', 'json'];
    if (model) {
      args.push('-m', model);
    }
    if (reasoning && reasoning !== 'off') {
      args.push('-r', reasoning);
    }
    args.push(prompt);

    const proc = spawn('droid', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`droid exec failed (code ${code}): ${stderr || stdout}`));
        return;
      }
      try {
        const cleanStdout = stripAnsi(stdout || '');
        const envelope = JSON.parse(cleanStdout || '{}');
        const resultText = stripAnsi((envelope.result || envelope.text || '').trim());
        if (!resultText) {
          reject(new Error('Empty result from droid exec'));
          return;
        }
        resolve(resultText);
      } catch (error) {
        reject(new Error(`Unable to parse droid exec output: ${error.message}`));
      }
    });
  });
}

async function classifyBatch(items, options, attempt = 1) {
  const prompt = buildPrompt(items);
  try {
    const raw = await runDroid(prompt, options);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) {
      throw new Error('Model response missing items array');
    }
    return parsed.items;
  } catch (error) {
    if (attempt >= 3) {
      throw error;
    }
    const delay = 500 * attempt;
    await new Promise(resolve => setTimeout(resolve, delay));
    return classifyBatch(items, options, attempt + 1);
  }
}

function applyClassifications(feed, items, labelField) {
  const lookup = new Map(items.map(entry => [entry.id, entry]));
  const classifiedAt = new Date().toISOString();

  feed.forEach(item => {
    const match = lookup.get(item.id);
    if (!match) return;
    const label = (match.label || '').toLowerCase();
    if (!['mention', 'bug', 'love', 'question', 'other'].includes(label)) return;
    const confidence = typeof match.confidence === 'number' ? Math.max(0, Math.min(1, match.confidence)) : null;
    item[labelField] = {
      label,
      confidence,
      reason: match.reason || '',
      classifiedAt,
    };
  });
}

function computeStats(feed, labelField) {
  const stats = {};
  let total = 0;
  feed.forEach(item => {
    const label = item[labelField]?.label || 'unlabeled';
    stats[label] = (stats[label] || 0) + 1;
    total += 1;
  });

  const percentOther = total > 0 && stats.other ? Number(((stats.other / total) * 100).toFixed(2)) : 0;

  return {
    generatedAt: new Date().toISOString(),
    total,
    counts: stats,
    percentOther,
  };
}

async function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const inputPath = options.input || options.i;
  if (!inputPath) {
    console.error('Missing --input <path>');
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const outputPath = path.resolve(process.cwd(), options.output || options.o || inputPath);
  const statsPath = path.resolve(process.cwd(), options.stats || path.join(path.dirname(outputPath), 'classification-stats.json'));
  const labelField = options['label-field'] || 'classification';
  const dryRun = Boolean(options['dry-run']);
  const maxBatch = parseInt(options['max-batch'] || DEFAULT_MAX_BATCH, 10);

  if (!process.env.FACTORY_API_KEY) {
    console.error('FACTORY_API_KEY is required for droid exec classification.');
    process.exit(1);
  }

  const feed = await readJson(resolvedInput);
  if (!Array.isArray(feed)) {
    throw new Error('Feed file must contain an array');
  }

  const pending = feed.filter(item => !(item[labelField] && item[labelField].label));
  if (pending.length === 0) {
    console.log('No items require classification.');
    if (!dryRun) {
      await writeJson(statsPath, computeStats(feed, labelField));
    }
    return;
  }

  console.log(`Classifying ${pending.length} item(s) with batches of ${maxBatch}...`);
  const batches = chunk(pending, maxBatch);
  const results = [];

  for (const batch of batches) {
    console.log(`→ Batch of ${batch.length} items`);
    const batchResults = await classifyBatch(batch, {
      model: options.model || DEFAULT_MODEL,
      reasoning: options.reasoning || DEFAULT_REASONING,
    });
    results.push(...batchResults);
  }

  if (dryRun) {
    console.log('Dry run complete. Sample response:', JSON.stringify(results.slice(0, 2), null, 2));
    return;
  }

  applyClassifications(feed, results, labelField);
  await writeJson(outputPath, feed);
  await writeJson(statsPath, computeStats(feed, labelField));

  console.log(`Classification saved to ${outputPath}`);
  console.log(`Stats saved to ${statsPath}`);
}

main().catch(error => {
  console.error('[classify-feed] Error:', error.message);
  process.exit(1);
});
