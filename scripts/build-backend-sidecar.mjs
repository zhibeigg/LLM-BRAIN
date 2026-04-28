import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { platform, arch } from 'node:os'

const explicitTarget = process.argv[2] || process.env.TAURI_TARGET_TRIPLE || ''

function detectHostTriple() {
  const os = platform()
  const cpu = arch()

  if (os === 'win32') {
    if (cpu === 'x64') return 'x86_64-pc-windows-msvc'
    if (cpu === 'arm64') return 'aarch64-pc-windows-msvc'
  }

  if (os === 'darwin') {
    if (cpu === 'x64') return 'x86_64-apple-darwin'
    if (cpu === 'arm64') return 'aarch64-apple-darwin'
  }

  if (os === 'linux') {
    if (cpu === 'x64') return 'x86_64-unknown-linux-gnu'
    if (cpu === 'arm64') return 'aarch64-unknown-linux-gnu'
  }

  throw new Error(`Unsupported host platform for sidecar build: ${os}/${cpu}`)
}

function findExecutable(name) {
  const command = platform() === 'win32' ? 'where' : 'which'
  const result = spawnSync(command, [name], { encoding: 'utf8', shell: platform() === 'win32' })
  if (result.status === 0) {
    const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  }
  throw new Error(`Unable to locate ${name} executable for Tauri sidecar packaging`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: platform() === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const targetTriple = explicitTarget || detectHostTriple()
const isWindows = targetTriple.includes('windows')
const sidecarOutput = resolve(
  'src-tauri',
  'binaries',
  `llm-brain-node-${targetTriple}${isWindows ? '.exe' : ''}`,
)
const backendResourceDir = resolve('src-tauri', 'resources', 'backend')

if (!existsSync(resolve('backend', 'dist', 'index.js'))) {
  throw new Error('backend/dist/index.js does not exist. Run `bun run build:backend` before packaging the desktop backend.')
}

mkdirSync(dirname(sidecarOutput), { recursive: true })
copyFileSync(findExecutable('node'), sidecarOutput)
if (!isWindows) chmodSync(sidecarOutput, 0o755)
console.log(`Prepared Node.js sidecar for ${targetTriple}: ${sidecarOutput}`)

rmSync(backendResourceDir, { recursive: true, force: true })
mkdirSync(backendResourceDir, { recursive: true })
cpSync(resolve('backend', 'dist'), resolve(backendResourceDir, 'dist'), { recursive: true })
cpSync(resolve('backend', 'package.json'), resolve(backendResourceDir, 'package.json'))
cpSync(resolve('backend', 'bun.lock'), resolve(backendResourceDir, 'bun.lock'))

console.log(`Installing production backend dependencies into ${backendResourceDir}`)
run('bun', ['install', '--production', '--frozen-lockfile'], { cwd: backendResourceDir })
