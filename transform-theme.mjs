import fs from 'fs';
import path from 'path';

const dir = './src/components/storefront';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

const replacements = [
  { regex: /(?<!dark:)\bbg-slate-950\b(?!(?:\/|-))/g, replace: 'bg-slate-50 dark:bg-slate-950' },
  { regex: /(?<!dark:)\bbg-slate-900\b(?!(?:\/|-))/g, replace: 'bg-white dark:bg-slate-900' },
  { regex: /(?<!dark:)\bbg-slate-800\b(?!(?:\/|-))/g, replace: 'bg-slate-100 dark:bg-slate-800' },
  { regex: /(?<!dark:)\bbg-slate-850\b(?!(?:\/|-))/g, replace: 'bg-slate-50 dark:bg-slate-850' },
  { regex: /(?<!dark:)\bborder-slate-800\b(?!(?:\/|-))/g, replace: 'border-slate-200 dark:border-slate-800' },
  { regex: /(?<!dark:)\bborder-slate-700\b(?!(?:\/|-))/g, replace: 'border-slate-300 dark:border-slate-700' },
  { regex: /(?<!dark:)\btext-slate-100\b(?!(?:\/|-))/g, replace: 'text-slate-900 dark:text-slate-100' },
  { regex: /(?<!dark:)\btext-slate-200\b(?!(?:\/|-))/g, replace: 'text-slate-800 dark:text-slate-200' },
  { regex: /(?<!dark:)\btext-slate-300\b(?!(?:\/|-))/g, replace: 'text-slate-700 dark:text-slate-300' },
  { regex: /(?<!dark:)\btext-slate-400\b(?!(?:\/|-))/g, replace: 'text-slate-600 dark:text-slate-400' },
  { regex: /(?<!dark:)\btext-white\b(?!(?:\/|-))/g, replace: 'text-slate-900 dark:text-white' },
  { regex: /(?<!dark:)hover:bg-slate-800\b(?!(?:\/|-))/g, replace: 'hover:bg-slate-200 dark:hover:bg-slate-800' },
  { regex: /(?<!dark:)hover:bg-slate-750\b(?!(?:\/|-))/g, replace: 'hover:bg-slate-200 dark:hover:bg-slate-750' },
  { regex: /(?<!dark:)\bbg-slate-950\/95\b/g, replace: 'bg-white/95 dark:bg-slate-950/95' },
  { regex: /(?<!dark:)\bbg-slate-900\/95\b/g, replace: 'bg-white/95 dark:bg-slate-900/95' },
  { regex: /(?<!dark:)\bbg-slate-900\/60\b/g, replace: 'bg-white/60 dark:bg-slate-900/60' },
  { regex: /(?<!dark:)\bborder-slate-800\/80\b/g, replace: 'border-slate-200/80 dark:border-slate-800/80' },
  { regex: /(?<!dark:)\bborder-slate-700\/80\b/g, replace: 'border-slate-300/80 dark:border-slate-700/80' },
  { regex: /(?<!dark:)\bbg-slate-800\/60\b/g, replace: 'bg-slate-100/60 dark:bg-slate-800/60' },
  { regex: /(?<!dark:)\bbg-slate-800\/80\b/g, replace: 'bg-slate-100/80 dark:bg-slate-800/80' },
  { regex: /(?<!dark:)\bbg-slate-800\/90\b/g, replace: 'bg-slate-100/90 dark:bg-slate-800/90' },
  { regex: /(?<!dark:)\bbg-slate-900\/80\b/g, replace: 'bg-slate-100/80 dark:bg-slate-900/80' },
  { regex: /(?<!dark:)\bdivide-slate-800\/60\b/g, replace: 'divide-slate-200/60 dark:divide-slate-800/60' },
  { regex: /(?<!dark:)\bdivide-slate-800\/80\b/g, replace: 'divide-slate-200/80 dark:divide-slate-800/80' },
  { regex: /(?<!dark:)\bdivide-slate-800\b/g, replace: 'divide-slate-200 dark:divide-slate-800' }
];

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  for (const { regex, replace } of replacements) {
    content = content.replace(regex, replace);
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}
