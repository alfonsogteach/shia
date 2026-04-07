import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const MEMORY_FILE = join(process.env.HOME, '.shia/memory.md');
export const SYSPRMPT_FILE = join(process.env.HOME, '.shia/sysprompt.md');
export const CONFIG_FILE = join(process.env.HOME, '.shia/config.json');

export const DEFAULT_CONFIG = {
  botName: 'Lucy',
  model: null,
  ollamaUrl: 'http://127.0.0.1:11434',
  verbose: false,
};

const DEFAULT_SYSPROMPT = `You are a helpful AI assistant. You respond clearly and concisely.`;

const DEFAULT_MEMORY = `# Memoria de Conversación

_(Esta memoria se actualiza automáticamente cada 4 intercambios)_
`;

async function ensureShiaDir() {
  try {
    await mkdir(join(process.env.HOME, '.shia'), { recursive: true });
  } catch {}
}

export async function loadConfig() {
  await ensureShiaDir();
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // First run: create default config
    await saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(cfg) {
  await ensureShiaDir();
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

export async function loadMemory() {
  await ensureShiaDir();
  try {
    return await readFile(MEMORY_FILE, 'utf-8');
  } catch {
    // First run: create empty memory
    await writeFile(MEMORY_FILE, DEFAULT_MEMORY, 'utf-8');
    return null;
  }
}

export async function loadSysprompt() {
  await ensureShiaDir();
  try {
    return await readFile(SYSPRMPT_FILE, 'utf-8');
  } catch {
    // First run: create default sysprompt
    await writeFile(SYSPRMPT_FILE, DEFAULT_SYSPROMPT, 'utf-8');
    return null;
  }
}

export async function saveMemory(conversationHistory) {
  await ensureShiaDir();
  const md = conversationHistory
    .filter((m) => m.role !== 'system')
    .map((m) => `## ${m.role === 'user' ? 'Usuario' : 'Asistente'}\n\n${m.content}`)
    .join('\n\n---\n\n');
  await writeFile(MEMORY_FILE, `# Memoria de Conversación\n\n${md}\n`, 'utf-8');
}

export async function getGpuStats() {
  try {
    const { execSync } = await import('child_process');
    const out = execSync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 3000 }
    );
    const [gpu, memUsed, memTotal, temp, power] = out.trim().split(',').map((s) => s.trim());
    return {
      gpu: parseInt(gpu),
      memUsed: parseInt(memUsed),
      memTotal: parseInt(memTotal),
      temp: parseInt(temp),
      power: parseFloat(power),
    };
  } catch {
    return null;
  }
}

export async function getOllamaInfo(baseUrl = 'http://127.0.0.1:11434') {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}
