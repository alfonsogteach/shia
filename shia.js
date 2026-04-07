#!/usr/bin/env node

import pkg from 'picocolors';
const { bold, cyan, green, yellow, red, magenta, white, gray } = pkg;
import boxen from 'boxen';
import { loadConfig, saveConfig, MEMORY_FILE, SYSPRMPT_FILE, loadMemory, saveMemory, loadSysprompt, getGpuStats } from './lib/core.js';
import { handleCommand, getCommands } from './lib/commands.js';
import { createInterface } from 'readline';

// ─── Readline with Tab autocomplete ───────────────────────────────────────────

function createInput() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: (line) => {
      if (line.startsWith('/')) {
        const cmd = line.slice(1).toLowerCase();
        const matches = getCommands()
          .filter((c) => c.startsWith(cmd))
          .map((c) => '/' + c);
        return [matches.length ? matches : [], line];
      }
      return [[], line];
    },
  });
  return rl;
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function showStartupBanner(config, gpuStats) {
  const cols = process.stdout.columns || 80;
  const sep = gray('─'.repeat(cols));
  const gpuStr = gpuStats
    ? (() => {
        const { gpu, memUsed, memTotal } = gpuStats;
        const memPct = Math.round((memUsed / memTotal) * 100);
        const barLen = 6;
        const filled = Math.round((gpu / 100) * barLen);
        const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
        const color = gpu > 80 ? red : gpu > 50 ? yellow : green;
        return `${color(bar)} ${cyan(memPct + '%')} VRAM`;
      })()
    : gray('—');

  console.log(sep);
  console.log(`${gray('│')} ${cyan('🛡️ ' + config.botName)} ${gray('│')} ${gray('model:')} ${cyan(config.model || '—')} ${gray('│')} ${gray('GPU:')} ${gpuStr}`);
  console.log(sep);
  console.log(`${gray('│')} ${cyan('/help')} ${gray('for commands')}`);
  console.log(sep);
  console.log();
}

// ─── Model Selection ──────────────────────────────────────────────────────────

function promptModelSelection(models, currentModel) {
  return new Promise((resolve) => {
    console.log(`\n${cyan('Available models:')}\n`);
    models.forEach((m, i) => {
      const marker = m.name === currentModel ? yellow(' ◄ current') : '';
      console.log(`  ${green(i + 1)}. ${m.name} ${gray(`(${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)`)}${marker}`);
    });
    console.log();

    const defaultIdx = currentModel ? models.findIndex((m) => m.name === currentModel) + 1 : 1;

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(`${cyan('Select model')} ${gray(`[${defaultIdx}]`)}: `, (answer) => {
      rl.close();
      const idx = parseInt(answer.trim()) || defaultIdx;
      const selected = models[idx - 1];
      resolve(selected ? selected.name : models[0].name);
    });
  });
}

async function getOllamaModels(baseUrl) {
  try {
    const res = await fetch(baseUrl + '/api/tags');
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

// ─── Streaming Chat ────────────────────────────────────────────────────────────

async function streamResponse(model, conversationHistory, config, baseUrl) {
  try {
    const res = await fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: conversationHistory, stream: true }),
    });

    if (!res.body) throw new Error('No streaming body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let reply = '';

    const cols = process.stdout.columns || 80;
    const sep = gray('─'.repeat(cols));

    process.stdout.write('\n' + sep + '\n');
    const botName = config.botName || 'Lucy';
    process.stdout.write(magenta('│ ' + botName) + ' ');

    let lineLen = 2 + botName.length;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const chunkLines = chunk.split('\n');

      for (const cLine of chunkLines) {
        if (!cLine.trim()) continue;
        try {
          const data = JSON.parse(cLine);
          if (data.done) {
            if (config.verbose && data.total_duration) {
              const secs = (data.total_duration / 1e9).toFixed(1);
              const promptTokens = data.prompt_eval_count || 0;
              const evalTokens = data.eval_count || 0;
              const totalTokens = promptTokens + evalTokens;
              const evalDurSecs = data.eval_duration / 1e9;
              const tokPerSec = evalDurSecs > 0 ? (evalTokens / evalDurSecs).toFixed(1) : '?';
              process.stdout.write(
                '\n' + gray(`  ⏱ ${secs}s  │  prompt: ${promptTokens} tok  │  eval: ${evalTokens} tok/s  │  total: ${totalTokens} tok`)
              );
            }
            process.stdout.write('\n' + sep + '\n');
            return reply;
          }
          if (data.message?.content) {
            for (const char of data.message.content) {
              if (char === '\n') {
                process.stdout.write('\n');
                lineLen = 0;
              } else {
                process.stdout.write(white(char));
                lineLen++;
                if (lineLen >= cols - 1) {
                  process.stdout.write('\n');
                  lineLen = 0;
                }
              }
            }
            reply += data.message.content;
          }
        } catch {}
      }
    }

    return reply;
  } catch (err) {
    console.log(`\n${red('✖ Error:')} ${err.message}\n`);
    return '';
  }
}

// ─── Chat Loop ─────────────────────────────────────────────────────────────────

async function chatLoop(model, systemPrompt, memory, config) {
  let conversationHistory = [];
  let currentModel = model;
  if (memory) conversationHistory.push({ role: 'system', content: memory });
  if (systemPrompt) conversationHistory.push({ role: 'system', content: systemPrompt });

  const rl = createInput();

  while (true) {
    const userInput = await new Promise((resolve) => {
      rl.question(`\n${cyan('➤ ')}`, resolve);
    });

    const trimmed = userInput.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.slice(1).split(' ');
      const result = await handleCommand(cmd, args.join(' '), {
        model: currentModel,
        rl,
        conversationHistory,
        config,
        updateConfig: async (patch) => {
          Object.assign(config, patch);
          await saveConfig(config);
        },
      });

      if (result === 'EXIT') {
        rl.close();
        return 'EXIT';
      }
      if (result === 'MODEL_CHANGED') {
        const newCfg = await loadConfig();
        currentModel = newCfg.model || currentModel;
        rl.close();
        return 'MODEL_CHANGED';
      }
      continue;
    }

    conversationHistory.push({ role: 'user', content: trimmed });

    const reply = await streamResponse(currentModel, conversationHistory, config, config.ollamaUrl);

    if (reply) {
      conversationHistory.push({ role: 'assistant', content: reply });
      if (conversationHistory.length % 4 === 0) {
        saveMemory(conversationHistory);
      }
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();

  console.log(bold(cyan('\n🛡️ Shield IA')) + ' ' + gray('by Alfonso Gonzalez'));
  console.log(gray('https://github.com/alfonsogteach/shia'));
  console.log(gray('─'.repeat(40)));

  const config = await loadConfig();
  if (config.botName) console.log(`${green('✓')} ${gray('Config loaded')}\n`);

  let systemPrompt = null;
  try {
    systemPrompt = await loadSysprompt();
    if (systemPrompt) console.log(`${green('✓')} ${gray('System prompt loaded')}\n`);
  } catch {}

  const memory = await loadMemory();
  if (memory) console.log(`${green('✓')} ${gray('Memory loaded')}\n`);

  const models = await getOllamaModels(config.ollamaUrl);
  if (models.length === 0) {
    console.log(`${red('✖ No models found. Is Ollama running?')}`);
    process.exit(1);
  }

  let selectedModel = config.model;

  if (selectedModel && models.some((m) => m.name === selectedModel)) {
    console.log(`${green('✓')} ${gray('Resuming model:')} ${cyan(selectedModel)}\n`);
  } else {
    selectedModel = await promptModelSelection(models, selectedModel);
    config.model = selectedModel;
    await saveConfig(config);
  }

  const gpuStats = await getGpuStats();
  showStartupBanner(config, gpuStats);

  let result;
  do {
    result = await chatLoop(selectedModel, systemPrompt, memory, config);
    if (result === 'MODEL_CHANGED') {
      const newCfg = await loadConfig();
      selectedModel = newCfg.model || selectedModel;
      showStartupBanner(newCfg, gpuStats);
    }
  } while (result === 'MODEL_CHANGED');
}

main().catch(console.error);
