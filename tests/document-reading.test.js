"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('minimal initialized instance can explicitly enable reading without installing authoring skills',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yss-reading-cli-')),target=path.join(root,'instance');
 try{
  const cli=path.resolve(__dirname,'../bin/create-yss-spec.js');let r=spawnSync(process.execPath,[cli,'--project-name','Reading','--business-domain','Demo','--team-size','1','--target-dir',target,'--agent-runtime','codex'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const cp='docs/.scratch/demo/checkpoint.yaml',p=path.join(target,cp);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(target,'.template-spec/process/templates/lifecycle-checkpoint-template.yaml'),p);
  const contract=(...args)=>spawnSync(process.execPath,[path.join(target,'scripts/contract'),...args,'--root',target],{encoding:'utf8'});
  r=contract('plan-enable','--checkpoint',cp,'--output','reading-enable.json');assert.equal(r.status,0,r.stderr);
  r=contract('apply-enable','reading-enable.json');assert.equal(r.status,0,r.stderr);
  r=contract('check-views','--checkpoint',cp);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'current');
  assert.equal(fs.existsSync(path.join(target,'.agents/skills/yss-stage-decision')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
