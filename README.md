# 🛡️ Shield IA

by **Alfonso Gonzalez** — https://github.com/alfonsogteach/shia

Terminal chat con Ollama. Interfaz local, configurable y minimalista para tu terminal.

---

## Requisitos

- [Ollama](https://ollama.ai/) instalado y funcionando
- Node.js 18+ (usa ES modules)
- NVIDIA GPU con `nvidia-smi` (opcional, para stats de GPU)

---

## Instalación

```bash
cd ~/Proyectos/shia
npm install
npm link
```

---

## Uso

```bash
shia
```

---

## Estructura de archivos

Todo vive en `~/.shia/` (se crea automáticamente en la primera ejecución):

| Archivo | Descripción |
|---------|-------------|
| `config.json` | Nombre del bot, modelo por defecto, URL de Ollama, verbose |
| `sysprompt.md` | System prompt personalizado |
| `memory.md` | Memoria de conversación (se actualiza cada 4 intercambios) |

---

## Configuración

### `~/.shia/config.json`

```json
{
  "botName": "Lucy",
  "model": "llama3.1:latest",
  "ollamaUrl": "http://127.0.0.1:11434",
  "verbose": false
}
```

| Campo | Descripción |
|-------|-------------|
| `botName` | Nombre del bot (aparece en el borde de cada respuesta) |
| `model` | Modelo por defecto de Ollama |
| `ollamaUrl` | URL del servidor Ollama (por defecto localhost) |
| `verbose` | `true` para mostrar stats al final de cada respuesta |

### `~/.shia/sysprompt.md`

Archivo de texto plano con el system prompt. Se carga al iniciar.

---

## Comandos

| Comando | Descripción |
|---------|-------------|
| `/config` | Menú interactivo de configuración (navega por número) |
| `/help` | Muestra esta ayuda |
| `/model` | Cambiar modelo de Ollama |
| `/models` | Lista todos los modelos disponibles |
| `/stats` | Muestra stats del sistema (GPU, modelo, Ollama) |
| `/name <texto>` | Cambia el nombre del bot |
| `/sysprompt` | Ver system prompt actual |
| `/setsysprompt <texto>` | Cambiar system prompt |
| `/memory` | Ver memoria actual |
| `/clear` | Limpiar conversación actual |
| `/exit` | Salir |

### `/config` — Menú interactivo

```
⚙️  Config Menu
────────────────────────────────────────
  1. Bot Name: vance
  2. Default Model: qwen3.5:4b
  3. Ollama URL: http://127.0.0.1:11434
  4. Verbose Stats: false
────────────────────────────────────────
  5. 💾 Guardar y salir
  0. Cancelar
────────────────────────────────────────
```

Selecciona número + Enter para editar, 5 para guardar.

### Verbose (`/config` → 4 → verbose: true)

Al final de cada respuesta del bot, en tono ténue:

```
⏱ 12.4s  │  prompt: 258 tok  │  eval: 304 tok/s  │  total: 562 tok
```

---

## Autocompletado

Al escribir `/` y pulsar **Tab**, se autocompletan los comandos disponibles.

---

## Arquitectura

```
shia/
├── shia.js              # Punto de entrada, chat loop, streaming
├── lib/
│   ├── core.js          # Config, memoria, GPU stats, Ollama API
│   └── commands.js      # Handlers de comandos /
├── README.md
├── .gitignore
└── package.json
```

### Flujo

1. `main()` — carga config, sysprompt y memoria
2. Si no hay modelo guardado o no existe → muestra selector de modelos
3. `chatLoop()` — loop principal de conversación
4. Streaming via Ollama `/api/chat` con `stream: true`
5. Cada 4 intercambios → guarda memoria en `~/.shia/memory.md`

---

## Primera ejecución

Si `~/.shia/` no existe, se crea automáticamente con:

- `config.json` — con valores por defecto
- `sysprompt.md` — con un prompt básico
- `memory.md` — vacía

---

## Seguridad

- **Todo es local** — sin dependencias externas, sin API keys
- **Los archivos de datos personales** (`~/.shia/`) nunca se suben a git
- `.gitignore` excluye `node_modules/`, `.shia/`, `sysprompt.md` y `memory.md`

---

## License

MIT
