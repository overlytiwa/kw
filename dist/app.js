import * as THREE from 'three';
import { GLTFLoader } from './assets/vendor/GLTFLoader.js';
import { RoomEnvironment } from './assets/vendor/RoomEnvironment.js';
import { albums } from './albums.js';
import { SceneResources } from './resource-cache.js';

const $ = s => document.querySelector(s);
const main = $('#main'), controls = $('#disc-controls'), orbit = $('#orbit');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const lerp = (a,b,t) => a+(b-a)*t;
const pad = n => String(n).padStart(2,'0');
const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view = 'home', selected = 0, target = 0, position = 0, pointer = {x:0,y:0};
let hovered = -1, flip = 0, flipNow = 0, changing = false, wheelSnap, smoothTarget = 0, lastWritten = 0;
let nextScroll = 0, lastWheelAt = 0, activeObserver, captionVersion = 0, routeVersion = 0;
let sceneReady = false, fallback = false, firstFrame = true, scene;
let frameRequest = 0;
let carouselVelocity = 0;
const styleIfChanged = (el,key,value) => {if(el.style[key]!==value)el.style[key]=value;};
function requestFrame(){if(!frameRequest&&!document.hidden&&!scene?.contextLost&&!scene?.disposed)frameRequest=requestAnimationFrame(animate);}
const buttons = albums.map((a,i)=>{
 const b=document.createElement('button');b.className='disc-hit';b.dataset.index=i;
 b.setAttribute('aria-label',`Select ${a.title}, ${a.year}`);
 b.innerHTML=`<img class="disc-fallback" src="${a.cover}" alt="" loading="lazy">`;
 b.addEventListener('click',e=>{const hit=e.detail&&scene?scene.pick(e.clientX,e.clientY):-1;discClick(hit>=0?hit:i);});
 b.addEventListener('focus',()=>{hovered=i;});
 b.addEventListener('blur',()=>{hovered=-1;});
 controls.append(b);return b;
});

function textWords(s){return s.split(' ').map((w,i)=>`<span class="word"><span style="animation-delay:${i*.035}s">${escapeHTML(w)}</span></span>`).join(' ');}
function stat(value){return value||'Unverified';}
function metadata(a){return `<dl class="caption-data"><div class="caption-row"><dt>Released</dt><dd class="caption-reveal">${a.year}</dd></div><div class="caption-row"><dt>Format</dt><dd class="caption-reveal">${escapeHTML(a.type)}</dd></div><div class="caption-row"><dt>Sound</dt><dd class="caption-reveal">${escapeHTML(a.genre)}</dd></div></dl>`;}
function updateCaption(){
 if(view!=='home')return;
 const a=albums[selected];captionVersion++;
 $('#album-caption').innerHTML=`<h1 class="caption-title" data-album="${a.slug}">${textWords(a.title)}</h1>${metadata(a)}`;
 $('#home-stats').innerHTML=`<div class="home-stat"><span class="micro">Spotify streams</span><div class="stat-value ${a.streams?'':'unavailable'}">${stat(a.streams)}</div><span class="stat-note">${a.edition||'As supplied · 05 Nov 2026'}</span></div><div class="home-stat"><span class="micro">Estimated album sales</span><div class="stat-value ${a.sales?'':'unavailable'}">${stat(a.sales)}</div><span class="stat-note">${a.sales?'Worldwide · pure purchases':'Worldwide total unavailable'}</span></div>`;
 $('#record-position').textContent=`${pad(selected+1)} / 17`;
 $('#previous-disc').disabled=selected===0;$('#next-disc').disabled=selected===16;
 document.title=`${a.title} — Kanye West`;
 $('#announcement').textContent=`${selected+1} of 17. ${a.title}, ${a.year}. Activate the centered disc to explore the album.`;
 buttons.forEach((b,i)=>{b.setAttribute('aria-label',`${i===selected?'Explore':'Center'} ${albums[i].title}, ${albums[i].year}`);b.setAttribute('aria-current',i===selected?'true':'false');});
 scene?.loadNearby(selected);
}
function renderHome(){
 activeObserver?.disconnect();
 carouselVelocity=0;
 view='home';document.body.dataset.view=view;
 main.innerHTML=`<section class="collection" aria-label="Kanye West’s album collection"><div class="album-caption" id="album-caption"></div><div class="home-stats" id="home-stats"></div><p class="collection-footnote">Seventeen records. Twenty-two years.<br>A discography in constant motion.</p><div class="collection-bottom"><div class="collection-position"><button id="previous-disc" aria-label="Previous album">←</button><span class="micro" id="record-position"></span><button id="next-disc" aria-label="Next album">→</button></div></div></section>`;
 $('#previous-disc').onclick=()=>select(selected-1);$('#next-disc').onclick=()=>select(selected+1);
 smoothTarget=lastWritten=0;window.scrollTo(0,0);flip=0;hovered=-1;
 updateCaption();
}
function recordData(a){return `<div class="record-byline"><span class="micro">Artist</span> Kanye West <span class="micro" style="margin-left:18px">Format</span> ${escapeHTML(a.type)}</div><dl class="record-data"><div class="data-row"><dt>Released</dt><dd>${a.date}</dd></div><div class="data-row"><dt>Sound</dt><dd>${escapeHTML(a.genre)}</dd></div><div class="data-row"><dt>Archive</dt><dd>${pad(a.index+1)} / 17 — 2004–2026</dd></div></dl>`;}
function renderAlbum(i,seamless=false){
 view='album';selected=target=position=i;document.body.dataset.view=view;
 const a=albums[i], n=albums[(i+1)%albums.length];
 flip=0;hovered=-1;nextScroll=0;
 main.innerHTML=`<article class="album-page ${seamless?'':'page-enter'}"><header class="record-header"><p class="record-kicker micro">The disc archive · Record ${pad(i+1)}</p><h1 class="record-title">${escapeHTML(a.title)}</h1>${recordData(a)}</header><section class="record-disc-stage" aria-label="Interactive 3D disc of ${escapeHTML(a.title)}"><div class="stage-side"><span class="stage-plus" aria-hidden="true">+</span><p class="micro">${a.year}<br>Side A / Side B</p></div><div class="stage-side right"><span class="stage-plus" aria-hidden="true">+</span><p class="micro">Move to discover<br>The other side</p></div><div class="stage-caption"><button class="text-action" id="flip-disc">Turn the disc ↻</button><span class="micro" id="flip-caption">Original artwork / Reflective reverse</span></div></section><section class="record-story reveal"><span class="micro">On the record</span><p class="record-description">${escapeHTML(a.description)}</p>${a.note?`<p class="story-note">${escapeHTML(a.note)}</p>`:''}</section><section class="artwork-section" aria-label="${escapeHTML(a.title)} artwork"><div class="artwork-inner"><img src="${a.cover}" alt="${escapeHTML(a.title)} album artwork" loading="lazy"></div><div class="artwork-label"><span class="micro">Kanye West · ${a.year}</span><p>${escapeHTML(a.title)}</p><span class="micro">${escapeHTML(a.genre)}</span></div></section><section class="song-section reveal"><h2 class="section-heading">In heavy rotation</h2><ol class="song-list">${a.songs.map((s,j)=>`<li><span class="micro">${pad(j+1)}</span><span class="song-name">${escapeHTML(s)}</span></li>`).join('')}</ol><p class="songs-disclaimer">Selected notable songs. Display order is not the album’s track sequence.</p></section><section class="numbers-section reveal"><h2 class="section-heading">The record, in numbers</h2><div class="numbers-grid"><div><p class="large-number ${a.streams?'':'unavailable'}">${stat(a.streams)}</p><span class="micro">Spotify streams</span></div><div><p class="large-number ${a.sales?'':'unavailable'}">${stat(a.sales)}</p><span class="micro">Estimated album purchases</span></div></div><div class="numbers-source"><p>${a.streams?`Spotify only. Figures supplied as of November 5, 2026.${a.edition?' '+a.edition+'.':''} Different editions can share track streams; totals should not be added together.`:'No verified complete Spotify album total was supplied for this release.'}</p><p>${a.sales?'Worldwide pure album sales estimates supplied from ChartMasters. Physical and digital purchases; excludes streaming-equivalent units.':'No reliable worldwide purchase total was supplied for this release.'} <a href="#about">About the figures ↗</a></p></div></section><section class="next-record" aria-label="Next album"><div class="next-header"><p class="micro">${i===16?'Back to the beginning':'Up next'} · Record ${pad(n.index+1)} / 17</p><h2 class="record-title">${escapeHTML(n.title)}</h2><div class="next-meta micro"><span>${n.year}</span><span>${escapeHTML(n.type)}</span></div></div><div class="next-open"><button class="text-action" id="open-next">Explore the next record ↗</button><span class="micro">Keep scrolling to continue</span></div><div class="next-progress" aria-hidden="true"></div></section></article>`;
 $('#flip-disc').onclick=toggleFlip;$('#open-next').onclick=()=>openAlbum(n.index,true);
 document.title=`${a.title} — Kanye West`;
 smoothTarget=lastWritten=0;window.scrollTo(0,0);
 $('#announcement').textContent=`${a.title}, ${a.year}. Album page.`;
 scene?.loadNearby(i);observeReveals();
}
function renderAbout(){
 activeObserver?.disconnect();$('#loader').classList.add('done');
 view='about';document.body.dataset.view=view;hovered=-1;
 main.innerHTML=`<article class="about-page page-enter"><h1 class="about-heading">An unfinished<br>discography.</h1><section class="about-intro"><span class="micro">Kanye West<br>The disc archive<br>2004 — 2026</span><p>Seventeen records. Twenty-two years. An exploration of a catalogue that keeps changing its shape — from soul samples and stadium synthesizers to industrial noise, gospel choirs, and everything in between.</p></section><div class="image-spaces" aria-label="Kanye West photography"><figure class="image-space portrait-photo"><img src="assets/about/kanye-portrait-960.webp" srcset="assets/about/kanye-portrait-480.webp 480w, assets/about/kanye-portrait-960.webp 960w, assets/about/kanye-portrait-1600.webp 1600w, assets/about/kanye-portrait-1911.webp 1911w" sizes="(max-width:800px) 52vw, 48vw" width="1911" height="2588" alt="Kanye West wearing sunglasses at the Vanity Fair event for the 2009 Tribeca Film Festival" loading="lazy" decoding="async"><figcaption class="micro">01 — Portrait, 2009<br><a href="https://commons.wikimedia.org/wiki/File:Kanye_West_Shankbone_2009_Vanity_Fair.jpg" target="_blank" rel="noopener noreferrer">David Shankbone</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a></figcaption></figure><figure class="image-space live-photo"><img src="assets/about/kanye-live-960.webp" srcset="assets/about/kanye-live-480.webp 480w, assets/about/kanye-live-960.webp 960w, assets/about/kanye-live-1600.webp 1600w, assets/about/kanye-live-3054.webp 3054w" sizes="(max-width:800px) 40vw, 35vw" width="3054" height="2333" alt="Kanye West performing under gold and violet stage lights at Roskilde Festival in 2009" loading="lazy" decoding="async"><figcaption class="micro">02 — Roskilde Festival, 2009<br><a href="https://commons.wikimedia.org/wiki/File:Kanye_West_Roskilde_Festival_2009.JPG" target="_blank" rel="noopener noreferrer">Bill Ebbesen</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a></figcaption></figure></div><section class="about-details"><span class="micro">About this archive</span><div class="about-copy"><p>This independent, unofficial archive brings together the seventeen solo, collaborative, and compilation albums in the supplied collection. The discs follow their release order, beginning with The College Dropout in 2004 and ending with Bully in 2026.</p><p>Each record is presented as a complete, two-sided compact disc. The printed labels are unofficial album-art concepts, rather than replicas of the original physical CD labels.</p><h2>A note on the numbers</h2><p>The album descriptions, dates, songs, and figures were supplied for this archive. Streaming figures are Spotify totals stated as of November 5, 2026, primarily attributed to Kworb. Album sales are supplied ChartMasters estimates of worldwide pure physical and digital purchases.</p><p>Streams, purchases, and album-equivalent units measure different things. The purchase estimates shown here exclude streaming and track-download equivalents. Where no verified total was supplied, the archive displays “Unverified.” Different editions can share track streams, so their totals should not be added together.</p><p>Source references: <a href="https://kworb.net/spotify/artist/5K4W6rqBFWDnAN6FQUkS6x_albums.html" target="_blank" rel="noopener noreferrer">Kworb — Spotify streams ↗</a> and <a href="https://chartmasters.org/kanye-west-albums-and-songs-sales/" target="_blank" rel="noopener noreferrer">ChartMasters — sales estimates ↗</a>.</p><h2>Always in motion</h2><p>Scroll or use the arrow keys to move through the collection. Select a disc to bring it to the centre, then select it again to explore the record. On an album page, turn the disc to see its reflective reverse. Keep scrolling at the end to move into the next release.</p></div></section><footer class="about-footer"><span class="micro">Independent music archive<br>Unaffiliated with Kanye West or his labels</span><a class="text-action" href="#">Back to the records ↗</a></footer></article>`;
 document.title='About — Kanye West';smoothTarget=lastWritten=0;window.scrollTo(0,0);
 buttons.forEach(b=>b.style.display='none');
}
function observeReveals(){
 activeObserver?.disconnect();
 activeObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('seen');activeObserver.unobserve(e.target);}}),{threshold:.12});
 document.querySelectorAll('.reveal').forEach(el=>activeObserver.observe(el));
}
function select(i){if(view!=='home')return;target=clamp(i,0,16);scene?.loadNearby(Math.round(target));}
function discClick(i){
 if(changing)return;
 if(view==='home'){if(i===selected&&Math.abs(position-i)<.12)openAlbum(i);else select(i);}
 else if(view==='album'){
  const next= (selected+1)%17;
  if(i===next)openAlbum(next,true);else toggleFlip();
 }
}
function toggleFlip(){flip+=Math.PI;$('#flip-caption').textContent=Math.round(flip/Math.PI)%2?'Reflective reverse / Turn to return':'Original artwork / Reflective reverse';}
function openAlbum(i,seamless=false){
 if(changing)return;changing=true;hovered=-1;
 const url=`#album/${albums[i].slug}`;
 history.pushState({album:i},'',url);
 routeVersion++;
 renderAlbum(i,seamless);
 main.focus({preventScroll:true});
 setTimeout(()=>{changing=false;requestFrame();},reduced?20:650);
}
function route(){
 routeVersion++;changing=false;
 const hash=decodeURIComponent(location.hash.slice(1));
 if(hash==='about')renderAbout();
 else if(hash.startsWith('album/')){const i=albums.findIndex(a=>a.slug===hash.slice(6));if(i>=0)renderAlbum(i);else{history.replaceState(null,'','#');renderHome();}}
 else{target=position=selected;renderHome();}
}
window.addEventListener('hashchange',route);window.addEventListener('popstate',()=>{if(!location.hash)route();});
window.addEventListener('pointermove',e=>{
 pointer.x=e.clientX/innerWidth*2-1;pointer.y=e.clientY/innerHeight*2-1;
 const overUI=e.target.closest('nav,.collection-bottom,.stage-caption,.next-open,.album-caption,.home-stats');
 hovered=coarse||overUI?-1:scene?scene.pick(e.clientX,e.clientY):Number(e.target.closest('.disc-hit')?.dataset.index??-1);
 if(view==='album'){
  const art=$('.artwork-section'),r=art?.getBoundingClientRect();
  if(r&&e.clientY>=r.top&&e.clientY<=r.bottom){
   const dx=(e.clientX/innerWidth-.5),dy=(e.clientY-r.top)/r.height-.5;
   if(!art.classList.contains('webgl-art')){
    $('.artwork-inner').style.transform=`translate(${dx*22}px,${dy*20}px) scale(1.07) rotate(${dx*.7}deg)`;
    const w=r.width,h=r.height,bend=dy*22;
    art.style.clipPath=`path('M0 20 C${w*.2} ${-bend},${w*.3} ${35+bend},${w*.5} 15 S${w*.8} ${-bend},${w} 20 L${w} ${h-20} C${w*.8} ${h+bend},${w*.7} ${h-35-bend},${w*.5} ${h-15} S${w*.2} ${h+bend},0 ${h-20} Z')`;
   }
  }
 }
});
window.addEventListener('pointerout',e=>{if(!e.relatedTarget){pointer.x=pointer.y=0;hovered=-1;}});
window.addEventListener('click',e=>{if(!e.target.closest('a,button')){const hit=scene?.pick(e.clientX,e.clientY)??-1;if(hit>=0)discClick(hit);}});
window.addEventListener('wheel',e=>{
 if(e.ctrlKey)return;
 const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?18:e.deltaMode===2?innerHeight:1);
 if(view==='home'){
  e.preventDefault();target=clamp(target+delta*.0021,0,16);scene?.loadNearby(Math.round(target));
  clearTimeout(wheelSnap);wheelSnap=setTimeout(()=>{target=Math.round(target);requestFrame();},130);
 }else{
  e.preventDefault();
  const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
  smoothTarget=clamp(smoothTarget+delta,0,max);
  if(view==='album'&&window.scrollY>max-12&&delta>0){
   if(performance.now()-lastWheelAt>700)nextScroll=0;
   nextScroll+=delta;lastWheelAt=performance.now();
   if(nextScroll>150)openAlbum((selected+1)%17,true);
  }else if(delta<0)nextScroll=0;
 }
},{passive:false});
let touchStart=null;
window.addEventListener('touchstart',e=>{touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY,pos:target,scroll:window.scrollY};},{passive:true});
window.addEventListener('touchmove',e=>{
 if(view==='home'&&touchStart){e.preventDefault();const dx=touchStart.x-e.touches[0].clientX,dy=touchStart.y-e.touches[0].clientY;target=clamp(touchStart.pos+(Math.abs(dx)>Math.abs(dy)?dx:dy)/(innerWidth*.55),0,16);}
},{passive:false});
window.addEventListener('touchend',e=>{
 if(view==='home')target=Math.round(target);
 else if(view==='album'&&touchStart){
  const max=document.documentElement.scrollHeight-innerHeight;
  const swipe=touchStart.y-e.changedTouches[0].clientY;
  if(touchStart.scroll>=max-10&&swipe>65)openAlbum((selected+1)%17,true);
 }
 touchStart=null;
},{passive:true});
window.addEventListener('keydown',e=>{
 if(e.altKey||e.ctrlKey||e.metaKey)return;
 const tag=document.activeElement.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
 if(view==='home'){
  if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();select(e.key==='Home'?0:e.key==='End'?16:selected+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1));}
  if(e.key==='Enter'&&document.activeElement===document.body){e.preventDefault();openAlbum(selected);}
 }else if(e.key==='Escape'){location.hash='';}
 else if(['PageDown','PageUp','Home','End'].includes(e.key)||(e.key===' '&&tag!=='BUTTON'&&tag!=='A')){
  e.preventDefault();const max=document.documentElement.scrollHeight-innerHeight;
  if(view==='album'&&window.scrollY>max-10&&['PageDown',' '].includes(e.key))openAlbum((selected+1)%17,true);
  else smoothTarget=clamp(e.key==='Home'?0:e.key==='End'?max:smoothTarget+(['PageUp'].includes(e.key)||e.shiftKey?-1:1)*innerHeight*.85,0,max);
 }
});

class DiscScene {
 constructor(){
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1:1.25));
  this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.82;
  $('#scene').append(this.renderer.domElement);
  this.renderer.domElement.addEventListener('webglcontextlost',()=>{this.contextLost=true;cancelAnimationFrame(frameRequest);frameRequest=0;});
  this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.dirty=true;requestFrame();});
  this.world=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-3,3,2,-2,.1,100);
  this.camera.position.z=12;this.camera.updateMatrixWorld();
  const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
  this.environment=pmrem.fromScene(room,.04);this.world.environment=this.environment.texture;
  room.dispose();pmrem.dispose();
  this.world.add(new THREE.HemisphereLight(0xe4eaf0,0x46403a,.32));
  const key=new THREE.DirectionalLight(0xfff3df,2.2);key.position.set(-4,3,7);this.world.add(key);
  const fill=new THREE.DirectionalLight(0xbac8da,.25);fill.position.set(3,-3,2);this.world.add(fill);
  this.loader=new GLTFLoader();this.groups=[];this.queue=[];this.inflight=0;this.states=[];
  this.dirty=true;this.needsMotion=false;this.renderCount=0;this.visibleSet=new Set();
  this.resources=new SceneResources();this.materials=this.resources.materials;this.wanted=new Set();
  this.lastOrbitAt=0;this.orbitPaths=[...orbit.querySelectorAll('path')];
  this.projection=new THREE.Matrix4();this.orbitPoint=new THREE.Vector3();
  this.raycaster=new THREE.Raycaster();this.pickRay=new THREE.Ray();this.pickMatrix=new THREE.Matrix4();
  this.pickPoint=new THREE.Vector3();this.discPlane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  this.pointerVector=new THREE.Vector2();
  this.artTextures=new Map();this.artRequests=new Map();this.textureLoader=new THREE.TextureLoader();this.artTime=0;
  this.artUniforms={uMap:{value:null},uTime:{value:0},uMouse:{value:new THREE.Vector2()},uAspect:{value:1}};
  this.artMesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,64,24),new THREE.ShaderMaterial({
   uniforms:this.artUniforms,depthTest:false,depthWrite:false,toneMapped:false,
   vertexShader:`varying vec2 vUv; uniform float uTime; uniform vec2 uMouse;
   void main(){vUv=uv;vec3 p=position;float phase=p.x*6.0+uTime*.24;
   p.y+=sin(phase+p.y*1.8)*.014+cos(p.x*3.5+uMouse.x*1.8)*.035*uMouse.y;
   p.x+=sin(p.y*4.0+phase*.4)*.004*uMouse.x;p.z+=cos(phase)*.04;
   gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
   fragmentShader:`varying vec2 vUv; uniform sampler2D uMap; uniform float uTime; uniform vec2 uMouse; uniform float uAspect;
   void main(){vec2 uv=vUv;if(uAspect>1.0){uv.y=(uv.y-.5)/uAspect+.5;}else{uv.x=(uv.x-.5)*uAspect+.5;}
   uv.x+=sin(uv.y*7.0+uTime*.3)*.003*uMouse.x;
   vec4 color=texture2D(uMap,uv);gl_FragColor=vec4(color.rgb*.45,1.0);
   #include <colorspace_fragment>
   }`
  }));
  this.artMesh.visible=false;this.artMesh.renderOrder=-1;this.world.add(this.artMesh);
  albums.forEach((a,i)=>{
   const g=new THREE.Group();g.visible=false;g.userData.index=i;this.world.add(g);this.groups[i]=g;
   this.states[i]={x:0,y:0,z:0,scale:1,rx:.4,ry:-.48,rz:.1,initialized:false};
  });
  this.resize();window.addEventListener('resize',()=>this.resize());
 }
 resize(){
  this.width=innerWidth;this.height=innerHeight;
  this.worldHeight=innerWidth<800?Math.max(4.4,innerHeight/innerWidth*2.45):3.22;
  this.worldWidth=this.worldHeight*innerWidth/innerHeight;
  Object.assign(this.camera,{left:-this.worldWidth/2,right:this.worldWidth/2,top:this.worldHeight/2,bottom:-this.worldHeight/2});
  this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);
  orbit.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);this.dirty=true;requestFrame();
  this.loadNearby(Math.round(target));
 }
 loadNearby(i){
  // Prefetch beyond the viewport, including wider browser windows.
  const spacing=this.width<800?1.84:1.72;
  const radius=view==='home'?Math.min(16,Math.ceil((this.worldWidth/2+1.8)/spacing)):2;
  const center=view==='home'?Math.round(position):selected;
  const nearby=[i,center,view==='home'?Math.round(target):selected];for(let step=1;step<=radius;step++)nearby.push(center+step,center-step);
  const valid=nearby.filter(j=>j>=0&&j<17);
  this.wanted=new Set(view==='about'?[]:valid);
  const pending=valid.filter(j=>!this.groups[j].userData.loaded&&!this.groups[j].userData.loading);
  this.queue=[...new Set(pending)].filter(j=>this.wanted.has(j));
  this.trimResources();this.pump();
 }
 surface(source,used){
  if(this.materials.has(source))return this.materials.get(source);
  // Single-pass materials retain the supplied geometry and label textures,
  // without the separate refraction/clearcoat passes on every disc.
  const material=new THREE.MeshStandardMaterial({name:source.name,color:source.color.clone(),map:this.resources.texture(source.map,used,true),
   normalMap:this.resources.texture(source.normalMap,used),normalScale:source.normalScale?.clone(),roughnessMap:this.resources.texture(source.roughnessMap,used),
   metalnessMap:this.resources.texture(source.metalnessMap,used),metalness:source.metalness,roughness:source.roughness,
   side:THREE.FrontSide,envMapIntensity:.42});
  if(source.name.startsWith('Aluminium data')){material.roughness=.24;material.metalness=1;material.envMapIntensity=.8;}
  else if(source.name.startsWith('Mirror band')){material.color.set(0x96999c);material.roughness=.18;material.metalness=.9;}
  else if(source.name.startsWith('Clear moulded')){
   material.color.set(0x8e949a);material.metalness=.42;material.roughness=.2;
   material.transparent=true;material.opacity=.86;material.depthWrite=false;material.side=THREE.DoubleSide;material.forceSinglePass=true;
  }else if(source.name.startsWith('Polished clear')){material.color.set(0x80878e);material.metalness=.65;material.roughness=.22;}
  else{material.roughness=.72;material.metalness=.02;material.envMapIntensity=.3;}
  if(material.map)material.map.anisotropy=Math.min(2,this.renderer.capabilities.getMaxAnisotropy());
  material.userData.baseOpacity=material.opacity;
  material.transparent=true;material.forceSinglePass=true;material.opacity=0;
  // A broad, soft studio shadow across the face costs no extra shadow-map pass.
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vDiscSurface;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvDiscSurface=vec2(position.x,-position.z)*16.666667;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vDiscSurface;')
    .replace('#include <opaque_fragment>',`float studioLight=smoothstep(-.75,.8,dot(vDiscSurface,vec2(-.7,.7)));
     outgoingLight*=mix(vec3(.44,.48,.54),vec3(1.0,.97,.91),studioLight);
     #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> 'archive-studio-shadow-v2';
  this.materials.set(source,material);source.dispose();return material;
 }
 pump(){
  if(this.disposed)return;
  while(this.inflight<2&&this.queue.length){
   const i=this.queue.shift();if(this.groups[i].userData.loaded||this.groups[i].userData.loading)continue;
   this.inflight++;this.groups[i].userData.loading=true;
   this.loader.load(`assets/models-shared/${albums[i].model.replace('.glb','.gltf')}`,gltf=>{
    const object=gltf.scene;object.rotation.x=Math.PI/2;object.scale.setScalar(1/.06);
    const used=new Set();let primitive=0;
    object.traverse(o=>{if(o.isMesh){o.frustumCulled=false;
     o.geometry=this.resources.geometry(`${object.userData.archiveGeometryKey}:${primitive++}`,o.geometry);
     o.material=Array.isArray(o.material)?o.material.map(m=>this.surface(m,used)):this.surface(o.material,used);
    }});
    const surfaces=new Set();object.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>surfaces.add(m));});
    this.groups[i].add(object);Object.assign(this.groups[i].userData,{loaded:true,loading:false,loadedAt:performance.now(),surfaces:[...surfaces],textureKeys:used,alpha:0});
    this.dirty=true;this.inflight--;this.trimResources();this.pump();requestFrame();
    if(i===selected){sceneReady=true;$('#loader').classList.add('done');}
   },undefined,error=>{
    console.error('Unable to load album model',albums[i].model,error);
    this.groups[i].userData.loading=false;this.inflight--;this.pump();
    if(i===selected)enableFallback();requestFrame();
   });
  }
 }
 trimResources(){
  for(let i=0;i<this.groups.length;i++){
   const group=this.groups[i];if(!group.userData.loaded||group.visible||this.wanted.has(i))continue;
   for(const material of group.userData.surfaces||[])material.dispose();
   this.resources.release(group.userData.textureKeys);group.clear();
   Object.assign(group.userData,{loaded:false,surfaces:[],textureKeys:null,alpha:0});
   const file=albums[i].model.replace('.glb','.gltf');
   for(const key of Object.keys(THREE.Cache.files))if(key.endsWith('/'+file))THREE.Cache.remove(key);
   this.renderer.renderLists.dispose();
  }
  for(const [index,texture] of this.artTextures){
   if(view==='album'&&index===selected)continue;
   if(this.artUniforms.uMap.value===texture)this.artUniforms.uMap.value=null;
   this.resources.releaseArtwork(texture);this.artTextures.delete(index);this.artRequests.delete(index);
  }
 }
 memoryStats(){return {...this.resources.stats(),residentModels:this.groups.filter(g=>g.userData.loaded).length,inflight:this.inflight,artworkTextures:[...this.artTextures.values()].filter(Boolean).length,gpuTextures:this.renderer.info.memory.textures,gpuGeometries:this.renderer.info.memory.geometries,cachedBitmaps:Object.values(THREE.Cache.files).filter(image=>typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap).length};}
 dispose(){
  this.disposed=true;clearTimeout(this.aboutReleaseTimer);cancelAnimationFrame(frameRequest);frameRequest=0;this.queue=[];
  for(const group of this.groups){for(const material of group.userData.surfaces||[])material.dispose();group.clear();}
  for(const texture of this.artTextures.values())this.resources.releaseArtwork(texture);
  this.artTextures.clear();this.artRequests.clear();this.resources.dispose();this.artMesh.geometry.dispose();this.artMesh.material.dispose();
  this.environment.dispose();this.renderer.dispose();this.renderer.forceContextLoss();
 }
 toWorld(x,y){return {x:(x/this.width-.5)*this.worldWidth,y:(.5-y/this.height)*this.worldHeight};}
 pick(x,y){
  if(view==='about')return -1;
  this.pointerVector.set(x/this.width*2-1,1-y/this.height*2);this.raycaster.setFromCamera(this.pointerVector,this.camera);
  let nearest=Infinity,index=-1;
  for(const g of this.groups){
   if(!g.visible||g.userData.alpha<.2)continue;
   this.pickMatrix.copy(g.matrixWorld).invert();this.pickRay.copy(this.raycaster.ray).applyMatrix4(this.pickMatrix);
   const hit=this.pickRay.intersectPlane(this.discPlane,this.pickPoint);
   if(!hit||hit.x*hit.x+hit.y*hit.y>1)continue;
   const distance=hit.applyMatrix4(g.matrixWorld).distanceToSquared(this.camera.position);
   if(distance<nearest){nearest=distance;index=g.userData.index;}
  }
  return index;
 }
 hover(i){
  if(hovered!==i||coarse||reduced)return {x:0,y:0};
  const s=this.states[i];return {x:clamp((pointer.x*this.worldWidth/2-s.x)/s.scale,-1,1),y:clamp((pointer.y*this.worldHeight/2+s.y)/s.scale,-1,1)};
 }
 place(i,x,y,scale,rx,ry,rz,dt,z=0,home=false,edge=1){
  const g=this.groups[i],s=this.states[i];this.visibleSet.add(i);
  delete g.userData.exitStartedAt;
  const revealAt=Math.max(g.userData.loadedAt??this.time,g.userData.revealAt??0);
  const progress=reduced?1:clamp((this.time-revealAt)/550,0,1);
  const arrival=1-Math.pow(1-progress,3),alpha=arrival*edge;
  if(g.userData.loaded&&Math.abs((g.userData.alpha??0)-alpha)>.00001){
   g.userData.alpha=alpha;for(const material of g.userData.surfaces)material.opacity=material.userData.baseOpacity*alpha;this.changed=true;
  }
  if(g.userData.loaded&&progress<1&&edge>0)this.needsMotion=true;
  const entering=1-arrival,direction=home?Math.sign(i-position)||1:1;
  x+=entering*.24*direction;y-=entering*.08;ry+=entering*.12*direction;scale*=1-entering*.025;
  const visible=!!g.userData.loaded&&alpha>.001;if(g.visible!==visible){g.visible=visible;this.changed=true;}
  const values={x,y,z,scale,rx,ry,rz},t=reduced||!s.initialized?1:1-Math.exp(-dt*14);
  for(const key of Object.keys(values)){
   const direct=home&&this.time-(this.homeEnteredAt??0)>650&&['x','y','z','scale'].includes(key);
   let next=direct?values[key]:lerp(s[key],values[key],t);
   if(Math.abs(values[key]-next)<.00015)next=values[key];
   if(Math.abs(next-s[key])>.000001)this.changed=true;
   s[key]=next;if(Math.abs(values[key]-next)>.00015)this.needsMotion=true;
  }
  s.initialized=true;g.position.set(s.x,s.y,s.z);g.rotation.set(s.rx,s.ry,s.rz);g.scale.setScalar(s.scale);g.updateMatrixWorld();
  const px=(s.x/this.worldWidth+.5)*this.width,py=(.5-s.y/this.worldHeight)*this.height;
  const size=s.scale*2/this.worldHeight*this.height,b=buttons[i];
  styleIfChanged(b,'display',visible&&alpha>.2?'block':'none');styleIfChanged(b,'left',`${px.toFixed(2)}px`);styleIfChanged(b,'top',`${py.toFixed(2)}px`);
  styleIfChanged(b,'width',`${(size*.86).toFixed(2)}px`);styleIfChanged(b,'height',`${(size*.86).toFixed(2)}px`);
  styleIfChanged(b,'zIndex',i===selected?'8':'5');
  const tabIndex=visible&&py>-size*.5&&py<this.height+size*.5&&px>-size*.5&&px<this.width+size*.5?0:-1;
  if(b.tabIndex!==tabIndex)b.tabIndex=tabIndex;
 }
 frame(dt,time){
  this.time=time;
  this.needsMotion=false;this.changed=false;this.visibleSet.clear();let artVisible=false;
  if(this.lastRoute!==routeVersion){
   clearTimeout(this.aboutReleaseTimer);
   if(view==='about'){
    this.wanted.clear();this.queue=[];
    this.aboutReleaseTimer=setTimeout(()=>{if(view==='about'){this.groups.forEach(g=>g.visible=false);this.trimResources();}},750);
   }else this.loadNearby(view==='home'?Math.round(target):selected);
   if(view==='home'&&this.lastView&&this.lastView!=='home'){
    this.homeEnteredAt=time;
    this.groups.forEach((g,i)=>{
     if(!g.visible)g.userData.revealAt=time+Math.min(Math.abs(i-selected),3)*40;
     else if(g.userData.alpha<.999)g.userData.revealAt=time-(1-Math.cbrt(1-g.userData.alpha))*550;
    });
   }
   this.lastView=view;
   this.lastRoute=routeVersion;this.dirty=true;
   this.stageEl=$('.record-disc-stage');this.nextEl=$('.next-record');this.artEl=$('.artwork-section');this.progressEl=$('.next-progress');
  }
  if(view==='about')return false;
  if(view==='home'){
   this.groups.forEach((g,i)=>{
    const d=i-position,mobile=this.width<800,spacing=mobile?1.84:1.72;
    const x=d*spacing,y=(mobile?-.18:-.035)+d*(mobile?.44:.58);
    if(Math.abs(x)>this.worldWidth/2+1.4||Math.abs(y)>this.worldHeight/2+1.4)return;
    const h=this.hover(i),lean=clamp(carouselVelocity*.012,-.075,.075);
    const edge=clamp(Math.min((this.worldWidth/2+1.1-Math.abs(x))/.5,(this.worldHeight/2+1.1-Math.abs(y))/.5),0,1);
    const fade=edge*edge*(3-2*edge);
    this.place(i,x,y,1,.40+h.y*.18,-.48+h.x*.25,.10+d*.025+lean,dt,-Math.abs(d)*1.05,true,fade);
   });
   if(hovered===selected&&sceneReady&&!reduced){this.drawOrbit(selected,time);this.needsMotion=true;}
  }else if(view==='album'){
   const stage=this.stageEl.getBoundingClientRect(),next=this.nextEl.getBoundingClientRect(),ar=this.artEl.getBoundingClientRect();
   const factor=this.height/this.worldHeight;
   if(ar.bottom>-50&&ar.top<this.height+50)artVisible=this.drawArtwork(this.artEl,ar,time,dt);
   if(stage.bottom>0&&stage.top<this.height){
    const c=this.toWorld(this.width*.5,stage.top+stage.height*.43),h=this.hover(selected);
    const scale=Math.min(stage.height*.36,this.width*.38)/factor;
    this.place(selected,c.x,c.y,scale,.13+h.y*.16,-.35+h.x*.23+flipNow,-.13+window.scrollY*.00012,dt);
   }
   if(next.top<this.height+100&&next.bottom>0){
    const n=(selected+1)%17;this.loadNearby(n);const h=this.hover(n);
    const c=this.toWorld(this.width*.5,next.top+next.height*.58),scale=Math.min(this.height*.265,this.width*.34)/factor;
    this.place(n,c.x,c.y,scale,.18+h.y*.12,-.4+h.x*.2,-.18,dt);
    if(this.progressEl)styleIfChanged(this.progressEl,'transform',`scaleX(${clamp(1-next.top/this.height,0,1).toFixed(4)})`);
   }
  }
  for(let i=0;i<this.groups.length;i++){
   if(!this.visibleSet.has(i)){
    const g=this.groups[i];styleIfChanged(buttons[i],'display','none');
    if(g.visible&&view==='album'&&!reduced){
     if(g.userData.exitStartedAt===undefined){g.userData.exitStartedAt=time;g.userData.exitAlpha=g.userData.alpha;}
     const p=clamp((time-g.userData.exitStartedAt)/360,0,1),alpha=g.userData.exitAlpha*(1-p)*(1-p);
     g.userData.alpha=alpha;for(const material of g.userData.surfaces)material.opacity=material.userData.baseOpacity*alpha;
     g.position.x+=(Math.sign(g.position.x)||1)*dt*.75;g.position.y+=Math.sign(g.position.y)*dt*.18;g.updateMatrixWorld();
     this.states[i].x=g.position.x;this.states[i].y=g.position.y;
     this.changed=true;this.needsMotion ||= p<1;
     if(p===1)g.visible=false;
    }else if(g.visible){g.visible=false;this.changed=true;}
   }
  }
  if(this.artMesh.visible!==artVisible){this.artMesh.visible=artVisible;this.changed=true;}
  this.trimResources();
  if(this.dirty||this.changed){this.renderer.render(this.world,this.camera);this.renderCount++;this.dirty=false;}
  return this.needsMotion;
 }
 drawArtwork(element,rect,time,dt){
  const a=albums[selected];
  if(!this.artTextures.has(selected)){
   this.artTextures.set(selected,null);
   const request=Symbol();this.artRequests.set(a.index,request);
   this.textureLoader.load(a.cover,texture=>{
    if(this.disposed||view!=='album'||selected!==a.index||this.artRequests.get(a.index)!==request){
     this.resources.releaseArtwork(texture);
     if(this.artRequests.get(a.index)===request){this.artTextures.delete(a.index);this.artRequests.delete(a.index);}
     return;
    }
    texture.colorSpace=THREE.SRGBColorSpace;this.artTextures.set(a.index,texture);this.dirty=true;requestFrame();
   },undefined,()=>this.artTextures.delete(a.index));
  }
  const texture=this.artTextures.get(selected);if(!texture)return false;
  if(!element.classList.contains('webgl-art')){element.classList.add('webgl-art');element.style.clipPath='none';element.querySelector('img').style.opacity='0';this.changed=true;}
  const c=this.toWorld(this.width/2,rect.top+rect.height/2),sy=rect.height/this.height*this.worldHeight*.95;
  if(this.artMesh.position.y!==c.y||this.artMesh.scale.y!==sy||this.artUniforms.uMap.value!==texture)this.changed=true;
  this.artMesh.position.set(c.x,c.y,-1);this.artMesh.scale.set(this.worldWidth*1.015,sy,1);
  this.artUniforms.uMap.value=texture;this.artUniforms.uAspect.value=this.width/rect.height;
  const screenY=(pointer.y+1)*.5*this.height,over=!coarse&&!reduced&&screenY>=rect.top&&screenY<=rect.bottom;
  const localY=clamp((screenY-rect.top-rect.height/2)*2/rect.height,-1,1),mouse=this.artUniforms.uMouse.value;
  const tx=over?pointer.x:0,ty=over?localY:0;
  if(Math.abs(mouse.x-tx)+Math.abs(mouse.y-ty)>.0005){mouse.x=lerp(mouse.x,tx,.15);mouse.y=lerp(mouse.y,ty,.15);this.changed=true;this.needsMotion=true;}
  if(over){this.artTime+=dt;this.changed=true;this.needsMotion=true;}
  this.artUniforms.uTime.value=this.artTime;return true;
 }
 drawOrbit(i,time){
  if(time-this.lastOrbitAt<33)return;this.lastOrbitAt=time;
  const group=this.groups[i];if(!group.visible)return;
  this.projection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse).multiply(group.matrixWorld);
  this.orbitPaths.forEach((path,j)=>{
   let d='';const total=96;
   for(let k=0;k<=total;k++){
    const a=k/total*Math.PI*2,r=1.045+j*.018+Math.sin(a*3+time*.0012+j*1.5)*.025+Math.sin(a*7-time*.0008+j)*.01;
    const v=this.orbitPoint.set(Math.cos(a)*r,Math.sin(a)*r,.035).applyMatrix4(this.projection);
    d+=`${k?'L':'M'}${((v.x*.5+.5)*this.width).toFixed(1)},${((-v.y*.5+.5)*this.height).toFixed(1)} `;
   }
   path.setAttribute('d',d+'Z');
  });
 }
}


function enableFallback(){
 fallback=true;document.body.classList.add('fallback');
 sceneReady=true;$('#loader').classList.add('done');requestFrame();
}
let previousTime=performance.now();
function animate(time){
 frameRequest=0;
 const dt=Math.min(.05,(time-previousTime)/1000);previousTime=time;
 const rate=reduced?1:1-Math.exp(-dt*12);
 let moving=false;
 if(view==='home'){
  if(reduced){position=target;carouselVelocity=0;}
  else{
   const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
   for(let i=0;i<steps;i++){carouselVelocity=clamp(carouselVelocity+((target-position)*100-carouselVelocity*19)*step,-4.5,4.5);position+=carouselVelocity*step;}
   if(Math.abs(position-target)<.00015&&Math.abs(carouselVelocity)<.001){position=target;carouselVelocity=0;}
  }
  moving=position!==target||carouselVelocity!==0;
  const nearest=clamp(Math.round(position),0,16);if(nearest!==selected){selected=nearest;hovered=-1;updateCaption();}
 }else{
  const y=window.scrollY;
  if(Math.abs(y-lastWritten)>3)smoothTarget=y;
  if(!touchStart){
   const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);smoothTarget=clamp(smoothTarget,0,max);
   const next=reduced?smoothTarget:lerp(y,smoothTarget,1-Math.exp(-dt*12));
   if(Math.abs(next-y)>.25){window.scrollTo(0,next);lastWritten=window.scrollY;moving=true;}else lastWritten=y;
  }else{smoothTarget=lastWritten=y;}
 }
 flipNow=Math.abs(flipNow-flip)<.00015?flip:lerp(flipNow,flip,rate*.85);
 moving ||= Math.abs(flipNow-flip)>.00015;
 const on=hovered===selected&&view==='home'&&!changing&&Math.abs(position-target)<.16;
 orbit.classList.toggle('active',on);
 $('#cursor-label').classList.toggle('visible',on&&!coarse);
 if(on)$('#cursor-label').style.transform=`translate3d(${(pointer.x+1)*innerWidth/2}px,${(pointer.y+1)*innerHeight/2}px,0) translate(-50%,20px)`;
 if(scene)moving=scene.frame(dt,time)||moving;
 else if(fallback)fallbackFrame();
 firstFrame=false;
 if(moving)requestFrame();
}
function fallbackFrame(){
 const w=innerWidth,h=innerHeight;buttons.forEach(b=>b.style.display='none');
 const show=(i,x,y,size)=>{const b=buttons[i];b.style.display='block';b.style.left=x+'px';b.style.top=y+'px';b.style.width=b.style.height=size+'px';b.style.transform=`translate(-50%,-50%) perspective(1000px) rotateY(${(hovered===i?pointer.x*12:0)-18}deg) rotateZ(-12deg)`;b.style.filter='brightness(.76)';};
 if(view==='home')albums.forEach((a,i)=>{const d=i-position;if(Math.abs(d)<2)show(i,w*.5+d*Math.min(w*.68,h*.53),h*.53-d*h*.18,Math.min(w*.88,h*.65));});
 else if(view==='album'){
  const r=$('.record-disc-stage').getBoundingClientRect();if(r.bottom>0&&r.top<h)show(selected,w*.5,r.top+r.height*.43,Math.min(w*.75,r.height*.7));
  const n=$('.next-record').getBoundingClientRect();if(n.top<h)show((selected+1)%17,w*.5,n.top+n.height*.58,Math.min(w*.7,h*.5));
 }
}
route();
try{scene=new DiscScene();scene.loadNearby(selected);}catch(error){console.error('3D viewer unavailable',error);enableFallback();}
['pointermove','pointerout','wheel','touchstart','touchmove','touchend','keydown','click','focusin','focusout','resize','scroll','hashchange','popstate'].forEach(type=>window.addEventListener(type,requestFrame,{passive:true}));
requestFrame();
setTimeout(()=>{$('#loader').classList.add('done');},9000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){hovered=-1;cancelAnimationFrame(frameRequest);frameRequest=0;}else requestFrame();});
window.addEventListener('pagehide',event=>{cancelAnimationFrame(frameRequest);frameRequest=0;if(!event.persisted)scene?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)requestFrame();});
// Small, read-only diagnostics used to verify the real model assets and routes.
window.archiveStatus=()=>({view,selected,target,position,sceneReady,fallback,hovered,loaded:scene?scene.groups.filter(g=>g.userData.loaded).length:0,models:albums.map(a=>a.model),renders:scene?.renderCount||0,drawCalls:scene?.renderer.info.render.calls||0,pixelRatio:scene?.renderer.getPixelRatio(),memory:scene?.memoryStats(),worldWidth:scene?.worldWidth,worldHeight:scene?.worldHeight,poses:scene?scene.groups.filter(g=>g.visible).map(g=>({index:g.userData.index,alpha:g.userData.alpha,scale:g.scale.x,x:g.position.x,y:g.position.y,z:g.position.z,rx:g.rotation.x,ry:g.rotation.y,rz:g.rotation.z})):[]});
