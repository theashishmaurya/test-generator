import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Detect the working directory of the app running on a given localhost port.
 * Uses lsof to find the PID, then resolves its cwd.
 */
export function detectAppRoot(port: number): string | null {
  try {
    // Find PID listening on the port
    const lsofOutput = execSync(
      `lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (!lsofOutput) return null;

    // Take the first PID (there might be multiple)
    const pid = lsofOutput.split('\n')[0].trim();
    if (!pid || isNaN(Number(pid))) return null;

    // Get the cwd of the process (macOS uses lsof -p, Linux uses /proc)
    let cwd: string | null = null;

    // macOS: use lsof -p to find cwd
    try {
      const cwdOutput = execSync(
        `lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (cwdOutput.startsWith('n')) {
        cwd = cwdOutput.slice(1);
      }
    } catch {}

    // Fallback: use pwdx on Linux or proc
    if (!cwd) {
      try {
        const procCwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        if (procCwd) cwd = procCwd;
      } catch {}
    }

    // Fallback: parse the command line to find the project directory
    if (!cwd) {
      try {
        const psOutput = execSync(
          `ps -p ${pid} -o command= 2>/dev/null`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        // Look for common patterns like "node /path/to/node_modules/.bin/vite"
        // The project root is usually the parent of node_modules
        const nodeModulesMatch = psOutput.match(/(\S+)\/node_modules/);
        if (nodeModulesMatch) {
          cwd = nodeModulesMatch[1];
        }
      } catch {}
    }

    if (!cwd) return null;

    // Walk up to find the nearest directory with a package.json
    return findPackageRoot(cwd);
  } catch {
    return null;
  }
}

/**
 * Walk up from a directory to find the nearest package.json.
 */
function findPackageRoot(dir: string): string | null {
  let current = dir;
  const root = path.parse(current).root;

  while (current !== root) {
    if (fs.pathExistsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

/**
 * Extract port from a URL string.
 */
export function extractPort(url: string): number | null {
  try {
    const parsed = new URL(url);
    const port = parseInt(parsed.port, 10);
    return isNaN(port) ? null : port;
  } catch {
    return null;
  }
}
