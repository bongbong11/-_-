import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { prepareProfileItems, createProfile } from '../character-library.js';
const require=createRequire(import.meta.url);
const { chromium }=require('playwright');
const root=path.resolve(import.meta.dirname,'..');
const prefix='/scripts/extensions/third-party/scene-reader/';
const wadeSource='Name: Wade\nRole: Businessman.\nHe controls his son.';
const wadeHash=createHash('sha256').update(wadeSource).digest('hex');
const wadeItem=prepareProfileItems({items:[{id:'c1',kind:'relationship',topic:'family_decisions',target:'son',rule:'Wade tends to control his son on family matters.'}]}).items;
const wadeProfile=createProfile(wadeItem,{characterId:'wade',sourceHash:wadeHash,source:wadeSource,analysisId:'browser'});
const store={settings:{global:{enabled:true,autoJudge:true,showConfidence:true,pauseOnOoc:true}},chat:null,history:[],characters:{enabled:true,characters:[{id:'hunter',name:'Hunter',source:'Hunter is a lawyer.',sourceVisibleToMain:true}],npcs:[{id:'wade',name:'Wade',source:wadeSource,sourceHash:wadeHash,sourceVisibleToMain:false,profile:wadeProfile}]}};
const requests=[];
const host=`<!doctype html><html><meta charset="utf-8"><style>:root{--SmartThemeBodyColor:#eee;--SmartThemeBlurTintColor:#25252b;--SmartThemeBorderColor:#666;--SmartThemeQuoteColor:#9cbfff}body{margin:0;background:#202025;color:var(--SmartThemeBodyColor);font:16px Arial}button,input,select,textarea{box-sizing:border-box;font:inherit}button{cursor:pointer}select,input,textarea{color:inherit;background:var(--SmartThemeBlurTintColor)}.menu_button{border:1px solid var(--SmartThemeBorderColor);border-radius:5px;padding:7px}.text_pole{width:100%;border:1px solid #666;padding:6px}.checkbox_label{display:flex;align-items:center;gap:6px}.checkbox_label input{width:auto}</style><link rel="stylesheet" href="${prefix}style.css"><div id="extensionsMenu"></div><div id="leftSendForm"><button id="extensionsMenuButton">wand</button></div><textarea id="send_textarea"></textarea><script>
const listeners=new Map(), prompts={},macros={};
window.mock={chat:[],prompts,macros,errors:[],worldBooks:{'Hunter Lore':{entries:{1:{uid:1,key:['door'],content:'The council meets tomorrow.'},2:{uid:2,key:['unrelated'],content:'Not relevant.'}}},'Hunter Extra':{entries:{3:{uid:3,constant:true,content:'Hunter owns the house.'}}}},async emit(name,...args){for(const fn of listeners.get(name)||[])await fn(...args)}};
window.ctx={characterId:1,characters:[null,{avatar:'Hunter.png',data:{extensions:{world:'Hunter Lore'}}}],chatId:'test-room',name1:'User',name2:'Hunter',chat:mock.chat,extensionPrompts:prompts,saveMetadata:async()=>{},macros:{register(name,value){macros[name]=value.handler},category:{MISC:'misc'}}};
window.SillyTavern={getContext:()=>ctx};window.jQuery=fn=>fn();
window.toastr=Object.fromEntries(['info','success','error','warning'].map(name=>[name,(message)=>{if(name==='error')mock.errors.push(message);let container=document.getElementById('toast-container');if(!container){container=document.createElement('div');container.id='toast-container';document.body.append(container)}const item={find(){return {text(){}}},toggleClass(){},remove(){},fadeOut(_ms,callback){callback?.call(item)}};return item}]));
window.eventSource={on(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)}};
</script><script type="module" src="${prefix}index.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
    if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(host);return;}
    if(req.url==='/script.js'){res.setHeader('Content-Type','application/javascript');res.end(`export const eventSource=window.eventSource;export const event_types=new Proxy({},{get:(_,key)=>key});export const chat_metadata={};export function saveSettingsDebounced(){};export function setExtensionPrompt(key,value){window.mock.prompts[key]=value};export function getRequestHeaders(){return {}}`);return;}
    if(req.url==='/scripts/extensions.js'){res.setHeader('Content-Type','application/javascript');res.end('export const extension_settings={};');return;}
    if(req.url==='/scripts/world-info.js'){res.setHeader('Content-Type','application/javascript');res.end("export const world_info={charLore:[{name:'Hunter',extraBooks:['Hunter Extra']}]};export async function loadWorldInfo(name){return window.mock.worldBooks[name]||null}");return;}
    if(req.url==='/scripts/extensions/shared.js'){res.setHeader('Content-Type','application/javascript');res.end(`export class ConnectionManagerRequestService {static getSupportedProfiles(){return [{id:'test-profile',name:'테스트 연결',model:'mock-model'}]} static getProfile(){return this.getSupportedProfiles()[0]} static validateProfile(){} static async sendRequest(){return {content:JSON.stringify({ok:true,anchors:[],new_items:[],affected:[],knowledge_updates:[],possible_followups:[]})}}}`);return;}
    if(req.url.startsWith('/api/plugins/scene-reader-jev/')){
        let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};requests.push({url:req.url,body});
        res.setHeader('Content-Type','application/json');let result={ok:true};
        if(req.url.endsWith('/bootstrap'))result={...store,ok:true,storageVersion:2,migrated:true,keyStatus:'저장됨 ····mock',backups:[]};
        else if(req.url.endsWith('/transaction')){store.chat=body.chat;store.history=body.history;}
        else if(req.url.endsWith('/settings'))store.settings=body.settings;
        else if(req.url.endsWith('/characters'))store.characters=body.value;
        else if(req.url.endsWith('/chat'))store.chat=body.value;
        else if(req.url.endsWith('/history'))store.history=body.value;
        else if(req.url.endsWith('/systemone'))result={answers:Object.fromEntries(Object.entries(body.questions||{}).map(([key,q])=>[key,{choice:key.startsWith('verification_')?'fulfilled':key.endsWith('_presence') && key.startsWith('character_')?'active':key.includes('_profile_slot_1')?Object.keys(q.criteria)[1]||'none':key.endsWith('_response_direction')?'act':({primary_focus:'direct',scene_state:'active',event_state:'none',npc_presence:'none',context_change_source:'none'}[key]||Object.keys(q.criteria)[0]),confidence:1}]))};
        res.end(JSON.stringify(result));return;
    }
    if(req.url.startsWith(prefix)){const file=path.resolve(root,decodeURIComponent(req.url.slice(prefix.length)));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(await readFile(file));return;}
    res.statusCode=404;res.end('not found');
}catch(error){res.statusCode=500;res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const errors=[];
try{
    const page=await browser.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});page.on('console',message=>{if(message.type()==='error')console.error(message.text())});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#scene-reader-quick-button').waitFor();await page.locator('#scene-reader-quick-button').click();
    await page.locator('#scene-reader-dialog[open]').waitFor();
    await page.evaluate(()=>window.toastr.info('toast layer check'));
    await page.waitForFunction(()=>document.getElementById('toast-container')?.parentElement?.id==='scene-reader-dialog');
    for(const width of [320,390,768,1280]){
        await page.setViewportSize({width,height:850});
        for(const tab of ['flow','advanced','conflict','characters']){
            await page.locator(`[data-sr-tab="${tab}"]`).click();
            assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,`${width}/${tab}: overflow`);
            const bad=await page.locator(`#sr-tab-${tab} button:visible`).evaluateAll(buttons=>buttons.filter(e=>e.clientWidth<28).map(e=>e.textContent));assert.equal(bad.length,0,`${width}/${tab}: narrow buttons`);
        }
    }
    await page.setViewportSize({width:390,height:850});await page.locator('[data-sr-tab="characters"]').click();
    await page.locator('[data-character-view-id="wade"]').click();await page.locator('#sr-character-analysis-result').getByText('Wade tends to control his son on family matters.').waitFor();
    await page.locator('#sr-settings-button').click();await page.locator('#sr-memory-charm').check();await page.locator('#sr-memory-lorebook').check();
    await page.locator('#sr-reasoner-profile').selectOption('test-profile');
    await page.locator('[data-sr-tab="flow"]').click();
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Open the door.'});await mock.emit('MESSAGE_SENT',0);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(requests.some(r=>r.body.state?.memory_reference?.entries?.some(e=>e.sourceId==='Hunter Lore:1')),'linked character lore must reach Jev');
    assert.ok(requests.some(r=>r.body.state?.memory_reference?.entries?.some(e=>e.sourceId==='Hunter Extra:3')),'auxiliary character lore must reach Jev');
    assert.ok(!requests.some(r=>r.body.state?.memory_reference?.entries?.some(e=>e.sourceId==='Hunter Lore:2')),'irrelevant lore must not reach Jev');
    assert.ok(await page.evaluate(()=>mock.prompts['scene-reader-router']?.length>0),'prompt slot receives injection');
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await page.locator('#sr-copy-debug').click();
    const debugReport=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
    assert.ok(debugReport.jevOriginalChoices.primary_focus,'debug copy retains Jev original choices');
    assert.ok(debugReport.decisions.primary_focus,'debug copy retains final coordination');
    assert.ok(!JSON.stringify(debugReport).includes('Open the door.'),'debug copy excludes raw chat');
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'Hunter opens the door.'});await mock.emit('MESSAGE_RECEIVED',1);mock.chat.push({is_user:true,mes:'(oOc: Explain.)',extra:{ooc_chat:true,ooc_instruction:'fixed wrapper'}});await mock.emit('MESSAGE_SENT',2);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-router']), '');
    await page.locator('#sr-settings-button').click();await page.locator('#sr-injection-mode').selectOption('macro');
    const beforeMacro=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Open the door again.'});await mock.emit('MESSAGE_SENT',3);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(requests.filter(r=>r.url.endsWith('/systemone')).slice(beforeMacro).some(r=>r.body.state?.memory_reference?.entries?.some(e=>e.sourceId==='Hunter Lore:1')),'character lore reaches Jev in macro mode');
    const beforeLoreEdit=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{
        mock.worldBooks['Hunter Lore'].entries[1].content='The door now needs a brass key.';
        await mock.emit('WORLDINFO_UPDATED','Hunter Lore',mock.worldBooks['Hunter Lore']);
        await mock.emit('GENERATION_AFTER_COMMANDS','swipe',{},false);
    });
    const afterLoreEdit=requests.filter(r=>r.url.endsWith('/systemone')).slice(beforeLoreEdit);
    assert.ok(afterLoreEdit.some(r=>r.body.state?.memory_reference?.entries.some(e=>e.text.includes('brass key'))),'changed linked book forces fresh judgment on swipe');
    assert.ok(!(await page.evaluate(()=>Object.values(mock.prompts).join(' '))).includes('The door now needs a brass key.'),'raw lore is not reinjected');
    await page.locator('#sr-settings-button').click();await page.locator('#sr-memory-lorebook').uncheck();
    await page.waitForFunction(()=>document.getElementById('sr-memory-status').textContent.includes('로어북: 사용 안 함'));
    const beforeCharm=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{window.__charmBridge={getStoryContext:()=> 'An earlier promise remains open.'};mock.chat.push({is_user:true,mes:'Ask about the promise.'});await mock.emit('MESSAGE_SENT',4);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    const charmRequest=requests.filter(r=>r.url.endsWith('/systemone')).slice(beforeCharm).find(r=>r.body.state?.memory_reference);
    assert.ok(charmRequest?.body.state.memory_reference.entries.some(e=>e.sourceKind==='charm'),'Charm remains available when character lore is off');
    assert.ok(!charmRequest?.body.state.memory_reference.entries.some(e=>e.sourceKind==='lorebook'),'disabled character lore is not sent');
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Wade enters the room.'});await mock.emit('MESSAGE_SENT',5);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(requests.some(r=>r.body.state?.character_profiles?.people?.some(person=>person.name==='Wade' && person.profileCandidates.length)),'stored Wade rules reach live Jev selection');
    assert.match(await page.evaluate(()=>mock.macros['scene-reader']?.()||''),/Wade: Wade tends to control his son on family matters\./,'the selected rule reaches the final injection');
    await mkdir(path.join(root,'artifacts'),{recursive:true});await page.locator('[data-sr-tab="characters"]').click();await page.locator('#sr-character-analysis-result').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts','mobile-characters.png')});
    await page.evaluate(()=>{document.documentElement.style.setProperty('--SmartThemeBodyColor','#202020');document.documentElement.style.setProperty('--SmartThemeBlurTintColor','#f5f5f7');});await page.screenshot({path:path.join(root,'artifacts','mobile-light.png')});
    await page.locator('#sr-npc-sheet-new').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-npc-sheet-new').click();
    await page.locator('#sr-character-name').fill('Mara');await page.locator('#sr-character-source').fill('Mara works as a gardener.');
    await page.locator('#sr-character-save').click();
    await page.locator('#sr-character-task-status').getByText('시트 저장됨 · 판독 필요').waitFor();
    await page.locator('#sr-character-editor-cancel').click();
    assert.ok(store.characters.npcs.some(p=>p.name==='Mara'),'saved NPC reaches server transport');
    await page.locator('[data-character-view-id]').filter({hasText:'Mara'}).click();
    await page.locator('#sr-character-analysis-result [data-character-edit-id]').click();await page.locator('#sr-character-delete').click();
    await page.locator('#sr-character-editor').waitFor({state:'hidden'});
    assert.equal(store.characters.npcs.some(p=>p.name==='Mara'),false);
    await page.locator('[data-sr-tab="advanced"]').click();await page.locator('#sr-world-new').evaluate(e=>e.closest('details').open=true);await page.locator('#sr-world-new').click();
    await page.locator('#sr-world-edit-name').fill('Garden world');await page.locator('#sr-world-edit-prompt').fill('An ordinary garden with no supernatural powers.');await page.locator('#sr-world-save').click();
    await page.locator('#sr-world-editor').waitFor({state:'hidden'});assert.ok(store.settings.worlds.some(w=>w.name==='Garden world'));
    await page.locator('#sr-world-manager-list button').filter({hasText:'Garden world'}).click();await page.locator('#sr-world-delete').click();await page.locator('#sr-world-editor').waitFor({state:'hidden'});
    assert.equal(store.settings.worlds.some(w=>w.name==='Garden world'),false);
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-copy-macro').evaluate(e=>{const d=e.closest('details');if(d)d.open=true;});await page.locator('#sr-copy-macro').click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'{{scene-reader}}');
    await page.locator('#sr-close').click();
    await page.waitForFunction(()=>document.getElementById('toast-container')?.parentElement===document.body);
    assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>mock.errors),[]);
    console.log('Browser passed: 4 viewport sizes × 4 tabs, controls, character details, linked primary/auxiliary lorebooks in depth and macro modes, prompt slot, OOC clearing, sheet/world save-delete, clipboard.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
