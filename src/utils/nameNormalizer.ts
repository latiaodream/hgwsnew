import { Converter } from 'opencc-js';

const s2tConverter = Converter({ from: 'cn', to: 'tw' });
const t2sConverter = Converter({ from: 'tw', to: 'cn' });

const punctuationRegex = /[\s·•．・\-_'"`~!@#$%^&*()（）【】\[\]{}|\\:;，,。.!?、<>《》「」『』＋+=]/g;

export function normalizeName(name?: string): string {
  if (!name) {
    return '';
  }

  return name
    .trim()
    .replace(punctuationRegex, '')
    .toLowerCase();
}

function toSimplified(name: string): string {
  try {
    return t2sConverter(name);
  } catch {
    return name;
  }
}

function toTraditional(name: string): string {
  try {
    return s2tConverter(name);
  } catch {
    return name;
  }
}

export function buildNameVariants(...names: (string | undefined)[]): Set<string> {
  const variants = new Set<string>();

  names.forEach(name => {
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const normalized = normalizeName(trimmed);
    if (normalized) variants.add(normalized);

    const simplified = normalizeName(toSimplified(trimmed));
    if (simplified) variants.add(simplified);

    const traditional = normalizeName(toTraditional(trimmed));
    if (traditional) variants.add(traditional);
  });

  return variants;
}
