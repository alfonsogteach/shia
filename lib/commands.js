import pkg from 'picocolors';
const { cyan, green, yellow, red, gray } = pkg;
import boxen from 'boxen';
import { getGpuStats, getOllamaInfo } from './core.js';
import { readFile, writeFile } from 'fs/promises';

const COMMANDS = ['config', 'help', 'model', 'models', 'sysprompt', 'setsysprompt', 'memory', 'clear', 'exit', 'stats', 'name'];

const HELP = `
${cyan('/help')}           Show this help
${cyan('/model')}          Switch model
${cyan('/models')}         List available models
${cyan('/stats')}          Show system stats (GPU, Ollama)
${cyan('/name')} <text>    Set bot name
${cyan('/sysprompt')}      Show current system prompt
${cyan('/setsysprompt')} <text>  Set system prompt
${cyan('/memory')}         Show current memory
${cyan('/clear')}          Clear conversation
${cyan('/exit')}           Exit
`.trim();

export async function handleCommand(cmd, args, ctx) {
  const { model, rl, conversationHistory, config, updateConfig } = ctx;

  switch (cmd.toLowerCase()) {

    case 'help':
      console.log(boxen(HELP, { padding: 1, borderColor: 'cyan' }));
      break;

    case 'model': {
      const models = await getOllamaInfo(config.ollamaUrl);
      console.log(`\n${cyan('Select model:')}\n`);
      models.forEach((m, i) => {
        const marker = m.name === model ? yellow(' ◄ current') : '';
        console.log(`  ${green(i + 1)}. ${m.name} ${gray(`(${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)`)}${marker}`);
      });
      console.log();

      const answer = await new Promise((resolve) => {
        rl.question(`${cyan('Choice')}: `, resolve);
      });

      const idx = parseInt(answer.trim());
      if (idx >= 1 && idx <= models.length) {
        const newModel = models[idx - 1].name;
        if (newModel !== model) {
          await updateConfig({ model: newModel });
          console.log(`${green('✓')} Model changed to ${yellow(newModel)}`);
          return 'MODEL_CHANGED';
        }
      }
      break;
    }

    case 'models': {
      const models = await getOllamaInfo(config.ollamaUrl);
      const list = models.map((m, i) => `  ${green(i + 1)}. ${m.name}  ${gray((m.size / 1024 / 1024 / 1024).toFixed(1) + ' GB')}`).join('\n');
      console.log(boxen(`${cyan('Available Models')}\n\n${list}`, { padding: 1, borderColor: 'cyan' }));
      break;
    }

    case 'stats': {
      const [gpuStats, models] = await Promise.all([getGpuStats(), getOllamaInfo()]);
      const cols = process.stdout.columns || 80;
      const line = gray('━'.repeat(cols));

      console.log(`\n${line}`);
      console.log(`${cyan('📊 System Stats')}`);
      console.log(line);

      if (gpuStats) {
        const { gpu, memUsed, memTotal, temp, power } = gpuStats;
        const memPct = Math.round((memUsed / memTotal) * 100);
        const barLen = 10;
        const filled = Math.round((gpu / 100) * barLen);
        const gpuBar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
        const gpuColor = gpu > 80 ? red : gpu > 50 ? yellow : green;
        console.log(`  GPU:     ${gpuColor(gpuBar)} ${cyan(gpu + '%')}  ${gray(temp + '°C')}  ${gray(power.toFixed(0) + 'W')}`);
        console.log(`  VRAM:    ${cyan(memPct + '%')} (${(memUsed / 1024).toFixed(0)} / ${(memTotal / 1024).toFixed(0)} GB)`);
      } else {
        console.log(`  ${gray('GPU: — (nvidia-smi not available)')}`);
      }

      console.log(line);
      console.log(`  ${gray('Model:')} ${cyan(model)}`);
      console.log(`  ${gray('Ollama:')} ${cyan(config.ollamaUrl)}`);
      console.log(`  ${gray('Models:')} ${cyan(models.length + ' loaded')}`);
      console.log(`${line}\n`);
      break;
    }

    case 'name': {
      if (!args) {
        console.log(`${gray('Current bot name:')} ${cyan(config.botName)}`);
        break;
      }
      await updateConfig({ botName: args });
      console.log(`${green('✓')} Bot name set to ${yellow(args)}`);
      break;
    }

    case 'sysprompt': {
      try {
        const sp = await readFile(process.env.HOME + '/.shia/sysprompt.md', 'utf-8');
        console.log(boxen(`${gray(sp)}`, { padding: 1, title: 'System Prompt' }));
      } catch {
        console.log(`${red('✖ No system prompt set')}`);
      }
      break;
    }

    case 'setsysprompt': {
      if (!args) {
        console.log(`${yellow('Usage: /setsysprompt <text>')}`);
        break;
      }
      await writeFile(process.env.HOME + '/.shia/sysprompt.md', args, 'utf-8');
      console.log(`${green('✓')} System prompt updated`);
      break;
    }

    case 'memory': {
      try {
        const mem = await readFile(process.env.HOME + '/.shia/memory.md', 'utf-8');
        console.log(boxen(`${gray(mem.slice(0, 500) + (mem.length > 500 ? '...' : ''))}`, { padding: 1, title: 'Memory' }));
      } catch {
        console.log(`${red('✖ No memory file')}`);
      }
      break;
    }

    case 'clear':
      conversationHistory.length = 0;
      console.log(`${green('✓')} Conversation cleared`);
      break;

    case 'config': {
      await configMenu(ctx);
      break;
    }

    case 'exit':
      console.log(`${cyan('👋 Bye!')}`);
      return 'EXIT';

    default:
      console.log(`${red('✖ Unknown command:')} ${yellow('/' + cmd)}`);
      console.log(`Type ${cyan('/help')} for available commands`);
  }

  return 'OK';
}

export function getCommands() {
  return COMMANDS;
}

async function configMenu(ctx) {
  const { config, updateConfig, rl } = ctx;

  const fields = [
    { key: 'botName', label: 'Bot Name' },
    { key: 'model', label: 'Default Model' },
    { key: 'ollamaUrl', label: 'Ollama URL' },
    { key: 'verbose', label: 'Verbose Stats' },
  ];

  while (true) {
    console.clear();
    console.log(cyan('⚙️  Config Menu'));
    console.log(gray('─'.repeat(40)));

    fields.forEach((field, i) => {
      let value = config[field.key];
      if (field.key === 'verbose') value = value ? green('true') : red('false');
      console.log(cyan(`  ${i + 1}. ${field.label}: `) + cyan(value));
    });

    console.log(gray('─'.repeat(40)));
    console.log(cyan('  5. 💾 Guardar y salir'));
    console.log(red('  0. Cancelar'));
    console.log(gray('─'.repeat(40)));

    const answer = await new Promise((resolve) => {
      rl.question(cyan('Selecciona opción: '), resolve);
    });

    const num = parseInt(answer.trim());

    if (num === 0) {
      console.log(yellow('Cancelado'));
      return;
    }

    if (num === 5) {
      await updateConfig(config);
      console.log(green('✓ Configuración guardada!'));
      return;
    }

    if (num >= 1 && num <= fields.length) {
      const field = fields[num - 1];
      console.clear();
      console.log(cyan('✏️  Editando: ' + field.label));
      console.log(gray('Valor actual: ' + config[field.key]));

      if (field.key === 'verbose') {
        console.log(green('  y = Yes  /  n = No'));
        const yn = await new Promise((resolve) => {
          rl.question(cyan('➤ '), (a) => {
            const aa = a.trim().toLowerCase();
            if (aa === 'y' || aa === 'yes') resolve(true);
            else if (aa === 'n' || aa === 'no') resolve(false);
            else resolve(null);
          });
        });
        if (yn !== null) config[field.key] = yn;
      } else {
        const newVal = await new Promise((resolve) => {
          rl.question(cyan('➤ '), (a) => resolve(a.trim()));
        });
        if (newVal) config[field.key] = newVal;
      }
    }
  }
}


function waitForKey(rl) {
  return new Promise((resolve) => {
    const handler = (input) => {
      rl.removeListener('line', handler);
      if (input === '\x1b[A') resolve('up');
      else if (input === '\x1b[B') resolve('down');
      else if (input === '\r') resolve('enter');
      else if (input === '\x1b') resolve('escape');
      else resolve('other');
    };
    rl.on('line', handler);
    rl.prompt();
  });
}

async function textPrompt(rl, defaultVal) {
  return new Promise((resolve) => {
    rl.question(cyan('➤ '), (answer) => {
      resolve(answer.trim());
    });
  });
}

async function yesNoPrompt(rl, current) {
  return new Promise((resolve) => {
    console.log(green('Y = Yes  /  n = No'));
    rl.question(cyan('➤ '), (answer) => {
      const a = answer.trim().toLowerCase();
      if (!a) resolve(current);
      else if (a === 'y' || a === 'yes') resolve(true);
      else if (a === 'n' || a === 'no') resolve(false);
      else resolve(null);
    });
  });
}
