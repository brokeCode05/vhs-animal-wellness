 'use strict';
// Execute the real renderer against a small DOM boundary; no model calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../public/web-page/public-vetti.js'),'utf8');
class Node {
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this._text=text;this.className='';this.classList={add:n=>{this.className+=' '+n}};}
 appendChild(n){this.children.push(n);return n;}
 setAttribute(k,v){this.attributes[k]=v;}
 set textContent(v){this.children=[];this._text=String(v);}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
}
const document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',text)};
const sandbox={document,el:(tag,cls)=>{const n=new Node(tag);n.className=cls;return n;}};
const start=src.indexOf('  function appendInlineText('),end=src.indexOf('  function messageNode(',start);
assert.ok(start>0&&end>start);vm.runInNewContext(src.slice(start,end),sandbox);
let checks=0;
const rows=Array.from({length:26},(_,i)=>'Catalog service '+(i+1));
const n=sandbox.bubbleNode({role:'vetti',text:'Current services:\n'+rows.map(x=>'• '+x).join('\n')+'\n\nAsk about a specific service.'});
assert.equal(n.tagName,'DIV');assert.equal(n.children[1].tagName,'UL');assert.equal(n.children[1].children.length,26);checks+=3;
assert.ok(n.children[1].className.includes('vetti-message-list--long'));checks++;
assert.deepEqual(n.children[1].children.map(x=>x.textContent),rows);checks++;
assert.equal(n.children[2].tagName,'P');checks++;
const ordered=sandbox.bubbleNode({role:'vetti',text:'1. Choose a pet\n3. **Review** before OTP'});
assert.equal(ordered.children[0].tagName,'OL');assert.equal(ordered.children[0].children[1].attributes.value,'3');checks+=2;
assert.equal(ordered.children[0].children[1].children[1].tagName,'STRONG');checks++;
for(const bullet of ['-','*','•']){
 const list=sandbox.bubbleNode({role:'vetti',text:bullet+' First\r\n'+bullet+' Second'});
 assert.equal(list.children[0].children.length,2);checks++;
}
const evil='<img src=x onerror=alert(1)> **<script>alert(1)</script>**';
const safe=sandbox.bubbleNode({role:'vetti',text:'• '+evil});
assert.equal(safe.children[0].children[0].textContent,'<img src=x onerror=alert(1)> <script>alert(1)</script>');checks++;
function tags(n){return [n.tagName,...n.children.flatMap(tags)];}
assert.ok(!tags(safe).some(t=>t==='IMG'||t==='SCRIPT'));checks++;
const user=sandbox.bubbleNode({role:'user',text:'• **Literal input** <script>bad()</script>'});
assert.equal(user.tagName,'P');assert.equal(user.children.length,0);assert.equal(user.textContent,'• **Literal input** <script>bad()</script>');checks+=3;
console.log(`PASS: public Vetti readable catalog, paragraphs, lists, numbering and text-only rendering (${checks} checks)`);
