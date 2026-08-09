import { existsSync, readFileSync } from 'node:fs';

export function loadLocalVars() {
  const values = { ...process.env };
  if (!existsSync('.dev.vars')) return values;

  for (const rawLine of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in values)) values[match[1]] = value;
  }

  return values;
}
