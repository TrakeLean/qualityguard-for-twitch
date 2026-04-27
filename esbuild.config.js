import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const entries = [
  'src/content.js',
  'src/injected.js',
  'src/background.js',
  'src/popup.js'
];

mkdirSync('dist/src', { recursive: true });
mkdirSync('dist/icons', { recursive: true });

const ctx = await esbuild.context({
  entryPoints: entries,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir: 'dist/src',
  logLevel: 'info'
});

await ctx.rebuild();

copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('src/popup.html', 'dist/src/popup.html');
copyFileSync('src/popup.css', 'dist/src/popup.css');
if (existsSync('icons')) cpSync('icons', 'dist/icons', { recursive: true });

if (watch) {
  await ctx.watch();
  console.log('watching for changes...');
} else {
  await ctx.dispose();
}
