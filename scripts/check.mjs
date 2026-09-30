import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
async function files(dir){
    const found=[];
    for(const entry of await readdir(dir,{withFileTypes:true})){
        if(['.git','node_modules','downloads','artifacts'].includes(entry.name))continue;
        const file=path.join(dir,entry.name);
        if(entry.isDirectory())found.push(...await files(file));
        else if(/\.(?:mjs|cjs|js)$/.test(entry.name))found.push(file);
    }
    return found;
}
for(const file of await files(root)){
    const result=spawnSync(process.execPath,['--check',file],{cwd:root,stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
}
for(const test of ['test.mjs','tests/regression/world-bank.mjs','tests/regression/unified.mjs','tests/regression/character-phase1.mjs','tests/regression/retrieval-core.mjs','tests/regression/progress-intensity.mjs','tests/regression/jev-assembly.mjs','tests/regression/character-live-current.mjs','tests/regression/character-transfer.mjs','tests/regression/scene-gate.mjs','tests/regression/scene-gate-runtime.mjs']){
    const result=spawnSync(process.execPath,[test],{cwd:root,stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
}
console.log('All source syntax and regression checks passed. Browser integration: npm run test:browser.');
