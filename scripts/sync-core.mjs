import {syncCore} from '../vendor/cli-core/build.mjs';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),values=args.filter(x=>x!=='--check');
if(values.length!==2)throw new Error('usage: node scripts/sync-core.mjs <source> <revision> [--check]');
syncCore(values[0],values[1],fileURLToPath(new URL('..',import.meta.url)),args.includes('--check'));
