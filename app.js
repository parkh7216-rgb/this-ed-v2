(() => {
'use strict';
const $ = document.getElementById('app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const apiBase = typeof window.MC_API_BASE_URL === 'string' ? window.MC_API_BASE_URL.trim().replace(/\/+$/, '') : '';
const apiEndpoint = path => `${apiBase}${path}`;
const LS = { get(k, fallback) { try { const value = localStorage.getItem(k); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }, set(k, value) { try { localStorage.setItem(k, JSON.stringify(value)); } catch {} } };
const shuffle = values => { const out = [...values]; for (let i = out.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [out[i], out[j]] = [out[j], out[i]]; } return out; };
const pct = (correct, total) => total ? Math.round(correct / total * 100) : 0;
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dates = () => new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
const photoSpellingQuestions = (Array.isArray(window.SCAN_PASSAGE_QUESTIONS)?window.SCAN_PASSAGE_QUESTIONS:[]).flatMap(source =>
  (Array.isArray(source.questions)?source.questions:[]).map(item => ({...item, selectionGroup:'교재 사진'})));
const additionalSpellingQuestions = [
  ...(Array.isArray(P)?P:[]),
  ...(Array.isArray(window.EXTRA_PASSAGE_QUESTIONS)?window.EXTRA_PASSAGE_QUESTIONS:[]),
  ...photoSpellingQuestions,
];
const spellingItems = [...R, ...additionalSpellingQuestions];
const chapterGroups = spellingItems.reduce((groups, item) => {
  const chapter = item.c || '기타 맞춤법';
  const match = chapter.match(/^(제\d+장)/);
  const key = item.selectionGroup || match?.[1] || chapter;
  (groups[key] ||= []);
  if (!groups[key].includes(chapter)) groups[key].push(chapter);
  return groups;
}, {});
const chapterRules = [...new Set(Object.values(chapterGroups).flat())];
const storedSelection = LS.get('mc_selected', null);
const initialSelected = Array.isArray(storedSelection)
  ? storedSelection.flatMap(value => chapterGroups[value] || [value]).filter(rule => chapterRules.includes(rule))
  : chapterRules;
let selectedChapters = new Set(initialSelected), count = 10, activeTab = 'home', quiz = null, friendSort = 'total';
let profile = LS.get('mc_p', null) || { nick: '', id: '' };
let stats = LS.get('mc_s', null) || { t:0, c:0, k:{}, d:{} };
let friends = LS.get('mc_f2', []);
let passages = LS.get('mc_passages', []);
let imagePreviewUrl = null;
const firebase = window.MC_FB || {};
const firebaseEnabled = () => Boolean(firebase.apiKey && firebase.projectId);
function persistStats() { LS.set('mc_s', stats); }
function record(category, correct) {
  const key = dateKey(new Date()); stats.t++; if (correct) stats.c++;
  const group = stats.k[category] || (stats.k[category] = [0,0]); group[0]++; if (correct) group[1]++;
  const day = stats.d[key] || (stats.d[key] = [0,0]); day[0]++; if (correct) day[1]++;
  persistStats(); clearTimeout(record.timer); record.timer = setTimeout(() => syncOwnRecord().catch(() => {}), 1000);
}
function lastSeven() { let total=0, correct=0; for (let i=0;i<7;i++) { const d=new Date(); d.setDate(d.getDate()-i); const day=stats.d[dateKey(d)]||[0,0]; total+=day[0]; correct+=day[1]; } return [total,correct]; }
function streak() { let days=0,d=new Date(); if (!(stats.d[dateKey(d)]||[0])[0]) d.setDate(d.getDate()-1); while ((stats.d[dateKey(d)]||[0])[0]) { days++; d.setDate(d.getDate()-1); } return days; }
function snapshot() { const week=lastSeven(); return { id:profile.id, n:profile.nick, t:stats.t, c:stats.c, w:week[0], x:week[1], u:dateKey(new Date()) }; }
function uidCode() { return Array.from({length:8},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join(''); }
const storePassages = () => LS.set('mc_passages', passages);
function shell(content, current=activeTab) {
  const nav = [['home','⌂','홈'],['spelling','가','맞춤법'],['passages','▤','지문'],['mine','＋','내꺼'],['stats','▥','내 기록'],['friends','♡','친구']];
  $.innerHTML = `<div class="app"><aside class="sidebar"><a class="brand" href="#" id="brandHome"><img src="icon-192.png" alt=""><span><strong>우리 ♡ 국어하자</strong><small>HANGUL STUDY CLUB</small></span></a><div class="side-label">LEARN</div><nav class="side-nav" aria-label="학습 메뉴">${nav.slice(0,4).map(([id,icon,label])=>`<button class="nav-btn ${current===id?'active':''}" data-tab="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav><div class="side-label" style="margin-top:29px">MY SPACE</div><nav class="side-nav">${nav.slice(4).map(([id,icon,label])=>`<button class="nav-btn ${current===id?'active':''}" data-tab="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav><div class="side-bottom"><div class="profile"><span class="avatar">${esc((profile.nick||'나').slice(0,1))}</span><span><strong>${esc(profile.nick||'닉네임 설정')}</strong><small>오늘도 한 걸음, 차곡차곡</small></span></div></div></aside><section class="workspace"><div class="workspace-inner">${content}</div></section></div>`;
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.tab)));
  document.getElementById('brandHome')?.addEventListener('click', event => { event.preventDefault(); openTab('home'); });
}
function openTab(tab) { activeTab=tab; if (!profile.nick) return showProfile(); ({home, spelling, passages:passageHome, mine, stats:statsPage, friends:friendsPage}[tab] || home)(); }
function heading(kicker,title,subtitle='') { return `<div class="topline"><div><div class="eyebrow">${esc(kicker)}</div><h1 class="heading">${esc(title)}</h1>${subtitle?`<p class="subheading">${esc(subtitle)}</p>`:''}</div><span class="today">${dates()}</span></div>`; }
function home() {
  const week=lastSeven();
  shell(`${heading('OUR KOREAN STUDY','오늘도, 한 문제씩','원하는 방식으로 골라 배우는 맞춤법 공부')}
  <div class="hero"><span class="mini">TODAY’S NOTE · 01</span><h2>아는 것을, 내 것으로.</h2><p>규정을 골라 풀고, 지문을 읽고, 내 지문으로 연습해 보세요.</p></div>
  <div class="section-head"><div><h2>어떻게 공부할까요?</h2><p>오늘 연습하고 싶은 방식을 골라 보세요.</p></div></div>
  <div class="cards"><button class="feature-card" data-tab="spelling"><span class="feature-icon">가</span><span><strong>맞춤법</strong><p>조항을 골라 변형 문제로 꼼꼼히 연습해요.</p></span><span class="arrow">↗</span></button><button class="feature-card" data-tab="passages"><span class="feature-icon">▤</span><span><strong>지문</strong><p>자료를 읽고 생각을 넓히는 지문 문제예요.</p></span><span class="arrow">↗</span></button><button class="feature-card" data-tab="mine"><span class="feature-icon">✳</span><span><strong>내꺼</strong><p>직접 넣은 지문을 AI 문제로 만들어 풀어요.</p></span><span class="arrow">↗</span></button></div>
  <div class="section-head"><div><h2>나의 공부</h2><p>이 기기에 차곡차곡 쌓이는 기록이에요.</p></div><button class="text-button" data-tab="stats">기록 자세히 보기 →</button></div>
  <div class="quickstats"><span>오늘 <b>${(stats.d[dateKey(new Date())]||[0])[0]||0}</b>문제</span><span>전체 정답률 <b>${pct(stats.c,stats.t)}%</b></span><span>연속 학습 <b>${streak()}일</b></span><button class="text-button" data-tab="friends">친구와 비교 →</button></div>
  <p class="footer-note">현재 닉네임과 학습 기록은 이 브라우저에 저장돼요. 다른 기기와 연동하려면 친구 코드·서버 연결 설정이 필요해요.</p>`, 'home');
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>openTab(button.dataset.tab)));
}
function chapterPicker() { return `<div class="rule-grid">${Object.entries(chapterGroups).map(([chapter, rules])=>`<section class="rule-group"><div class="rule-title"><strong>${esc(chapter)}</strong><button class="link-btn" data-chapter-group="${esc(chapter)}">${rules.every(rule=>selectedChapters.has(rule))?'전체 해제':'전체 선택'}</button></div><div class="rule-options">${rules.map(rule=>`<button class="chip ${selectedChapters.has(rule)?'on':''}" data-rule="${esc(rule)}">${esc(rule.replace(chapter+' ','')||'기본')}</button>`).join('')}</div></section>`).join('')}</div>`; }
function spelling() {
  shell(`${heading('SPELLING PRACTICE','맞춤법','공부할 장과 조항을 직접 골라서 풀어 보세요.')}
    <section class="panel"><div class="panel-title"><h2>조항 선택</h2><span class="muted">현재 ${selectedChapters.size}개 선택</span></div>${chapterPicker()}<div class="actions"><button class="chip" id="selectAll">${selectedChapters.size===chapterRules.length?'전체 해제':'전체 선택'}</button></div></section>
    <section class="panel"><div class="panel-title"><h2>문항 수</h2><span class="muted">복수 규칙을 묻는 고난도 보기도 포함돼요.</span></div><div class="chips" style="margin-top:15px">${[10,20,30].map(n=>`<button class="chip ${count===n?'on':''}" data-count="${n}">${n}문항</button>`).join('')}</div><div class="notice">문제마다 선택지가 다시 섞여 나와요. 정답을 고르면 자세한 해설을 확인할 수 있습니다.</div><div class="actions"><button class="btn" id="startSpelling">선택한 조항으로 풀기 →</button><span class="muted">기본 자료 + 새 고난도 보기</span></div></section>`, 'spelling');
  $.querySelectorAll('[data-rule]').forEach(button=>button.addEventListener('click',()=>{const rule=button.dataset.rule;selectedChapters.has(rule)?selectedChapters.delete(rule):selectedChapters.add(rule);LS.set('mc_selected',[...selectedChapters]);spelling();}));
  $.querySelectorAll('[data-chapter-group]').forEach(button=>button.addEventListener('click',()=>{const rules=chapterGroups[button.dataset.chapterGroup];if(rules.every(rule=>selectedChapters.has(rule)))rules.forEach(rule=>selectedChapters.delete(rule));else rules.forEach(rule=>selectedChapters.add(rule));LS.set('mc_selected',[...selectedChapters]);spelling();}));
  $.querySelectorAll('[data-count]').forEach(button=>button.addEventListener('click',()=>{count=+button.dataset.count;spelling();}));
  document.getElementById('selectAll').onclick=()=>{selectedChapters=selectedChapters.size===chapterRules.length?new Set():new Set(chapterRules);LS.set('mc_selected',[...selectedChapters]);spelling();};
  document.getElementById('startSpelling').onclick=()=>{const chosen=R.filter(item=>selectedChapters.has(item.c));const additional=additionalSpellingQuestions.filter(item=>selectedChapters.has(item.c));startQuiz(makeMixedSet([...chosen.map(makeRuleQuestion),...additional],count,'맞춤법'));};
}
function makeRuleQuestion(rule) {
  const positive = [], negative = [];
  if (rule.A.length>=4) positive.push('positive'); if (rule.B.length>=4) negative.push('negative');
  const mode=shuffle([...positive,...negative])[0] || 'positive';
  let correct, wrong, prompt;
  const decode=entry=>String(entry).split('>');
  if (mode==='positive') { correct=shuffle(rule.A)[0]; const correctForms=new Set(rule.A); wrong=shuffle(rule.B.filter(item=>!correctForms.has(decode(item)[1]))).slice(0,4); prompt=rule.y; }
  else { const bad=shuffle(rule.B)[0]; correct=bad; const repaired=decode(bad)[1]; wrong=shuffle(rule.A.filter(item=>item!==repaired)).slice(0,4); prompt=rule.n; }
  const options=shuffle([correct,...wrong].map(decode)); const answer=options.findIndex(([label])=>label===decode(correct)[0]);
  const rationale=rule.e+'\n\n'+options.map(([shown, fixed])=>fixed?`✗ ${shown} → ${fixed}`:`○ ${shown}`).join('\n');
  return {c:rule.c,q:`[${rule.h}] ${prompt}`,o:options.map(([shown])=>shown),a:answer,e:rationale};
}
function makeMixedSet(items, amount, label) { const list=shuffle(items); return list.length?shuffle(list.slice(0,Math.min(amount,list.length))).map(item=>({...item,section:label})):[]; }
function passageHome() {
  shell(`${heading('PASSAGE PRACTICE','지문','원문을 받은 뒤 실제 지문 자료만 이곳에 추가할게요.')}
    <section class="panel center"><span class="tag">원문 대기</span><h2>아직 추가된 지문이 없어요.</h2><p class="subheading">지문은 보내주시는 자료를 확인한 뒤 등록하겠습니다. 맞춤법 원칙·보기형 문제는 모두 맞춤법 탭으로 옮겼어요.</p><div class="actions" style="justify-content:center"><button class="btn secondary" id="toMine">내 지문으로 문제 만들기 →</button></div></section>`, 'passages');
  document.getElementById('toMine').onclick=()=>openTab('mine');
}
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
function readAsDataUrl(blob) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진 파일을 읽지 못했어요. 다시 선택해 주세요.'));reader.readAsDataURL(blob);}); }
async function preparePassageImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('JPEG, PNG, WebP 사진만 올릴 수 있어요.');
  if (!file.size) throw new Error('사진 파일이 비어 있어요. 다시 선택해 주세요.');
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('원본 사진은 20MB 이하로 올려 주세요.');
  let bitmap, fallbackUrl;
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file);
    else {
      fallbackUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('사진을 열 수 없어요. JPEG, PNG, WebP로 다시 선택해 주세요.'));image.src=fallbackUrl;});
    }
    const width=bitmap.width||bitmap.naturalWidth,height=bitmap.height||bitmap.naturalHeight,edge=Math.max(width,height);
    if(!width||!height||width*height>48000000)throw new Error('사진 해상도가 너무 커요. 더 작은 사진을 선택해 주세요.');
    for (let factor=1;factor>=0.45;factor*=0.82) {
      const scale=Math.min(1,2600/edge)*factor;
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((bitmap.width||bitmap.naturalWidth)*scale));canvas.height=Math.max(1,Math.round((bitmap.height||bitmap.naturalHeight)*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('사진을 처리하지 못했어요.');
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const quality=Math.max(0.72,0.92-(1-factor)*0.4),blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=MAX_IMAGE_BYTES)return readAsDataUrl(blob);
    }
    throw new Error('사진을 4MB 이하로 줄이지 못했어요. 더 작은 사진을 선택해 주세요.');
  } catch(error) {
    if(error.message?.includes('사진'))throw error;
    throw new Error('사진을 열거나 줄이지 못했어요. JPEG, PNG, WebP 사진으로 다시 선택해 주세요.');
  } finally { bitmap?.close?.();if(fallbackUrl)URL.revokeObjectURL(fallbackUrl); }
}
function releaseImagePreview() { if(imagePreviewUrl){URL.revokeObjectURL(imagePreviewUrl);imagePreviewUrl=null;} }
function previewSelectedImage(file) {
  releaseImagePreview();const preview=document.getElementById('imagePreview');if(!preview)return;
  if(!file){preview.replaceChildren();return;}
  imagePreviewUrl=URL.createObjectURL(file);
  preview.innerHTML=`<img src="${esc(imagePreviewUrl)}" alt="선택한 지문 사진 미리보기"><span>${esc(file.name)}</span>`;
}
async function explain405() {
  let apiReady=false;
  try{const health=await fetch(apiEndpoint('/api/health'),{cache:'no-store'});if(health.ok){const state=await health.json();apiReady=state?.ok===true;}}catch{}
  if(location.hostname.endsWith('.github.io')&&!apiBase)return `현재 주소 ${location.origin}는 정적 GitHub Pages라 자체 Node.js API가 없고, 연결된 API 주소도 설정되지 않았어요(405). 앱을 새로고침하거나 서버 연결 상태를 확인해 주세요.`;
  if(!apiReady)return `현재 주소 ${location.origin}에서 문제 생성 서버를 찾지 못했어요(405). 정적 호스팅 주소일 수 있습니다. Node.js 서버가 연결된 Manus 앱에서 다시 열어 주세요.`;
  if(location.hostname.endsWith('.github.io'))return 'Pages에서 연결된 Node.js 서버는 응답하지만 문제 생성 요청을 받지 않았어요(405). 잠시 후 새로고침해 다시 시도해 주세요.';
  return '문제 생성 서버는 응답하지만 이 요청 방식을 받지 않았어요(405). 앱을 새로고침해 최신 화면으로 다시 시도해 주세요.';
}
function mine(message='', error=false) {
  const source=passages.find(item=>item.id===new URLSearchParams(location.search).get('passage'));
  shell(`${heading('MY PASSAGES','내꺼','내가 고른 지문을 넣으면 AI가 지문에 근거한 문제를 만들어요.')}
    <section class="panel"><div class="panel-title"><h2>새 지문 추가하기</h2><span class="tag ai">AI 독해 문제</span></div><p class="small">지문을 붙여넣거나 사진으로 올리면 그 원문만 근거로 고난도 5지선다 독해 문항 5개와 정답·선택지별 해설을 만들어요. 둘 중 한 가지 입력 방식을 선택해 주세요.</p><form id="passageForm"><label class="form-label" for="passageTitle">지문 제목</label><input id="passageTitle" maxlength="100" placeholder="예: 우리말의 변화" required><label class="form-label" for="passageText">지문 직접 입력</label><textarea id="passageText" maxlength="6000" placeholder="분량 40~6,000자. 지문을 그대로 붙여 넣어 주세요."></textarea><div class="input-divider"><span>또는 사진으로 넣기</span></div><label class="form-label" for="passageImage">지문 사진</label><input id="passageImage" class="file-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><div id="imagePreview" class="image-preview" aria-live="polite"></div><p class="small">JPEG·PNG·WebP, 원본 최대 20MB(전송 전 자동 축소). 사진 원본은 저장하지 않고, 생성된 원문과 문제만 이 기기에 저장합니다.</p><div class="actions"><button class="btn" id="generateButton" type="submit">문제 만들기</button><span class="small">문제 생성에는 인터넷 연결이 필요해요.</span></div><div id="generationMessage" class="message ${error?'error':''}">${esc(message)}</div></form></section>
    ${source?`<section class="panel"><div class="panel-title"><h2>${esc(source.title)}</h2><span class="tag ai">${source.questions?.length?`${source.questions.length}문항 생성됨`:'문제 생성 대기'}</span></div><p class="small">${esc(source.text.slice(0,180))}${source.text.length>180?'…':''}</p><details class="recognized-passage"><summary>읽은 지문 전체 확인</summary><div class="passage">${esc(source.text)}</div></details><div class="actions">${source.questions?.length?'<button class="btn" id="playSaved">내 문제 풀기 →</button>':''}<button class="btn secondary" id="retryGenerate">AI로 다시 만들기</button><button class="btn danger" id="deletePassage">삭제</button></div></section>`:''}
    <div class="section-head"><div><h2>내가 저장한 지문</h2><p>저장한 지문은 이 기기에서 언제든 다시 열 수 있어요.</p></div></div>
    <div class="passage-list">${passages.length?passages.map(item=>`<article class="passage-card"><span class="tag ai">${item.questions?.length?'문제 준비 완료':'문제 생성 대기'}</span><h3>${esc(item.title)}</h3><p>${esc(item.text.slice(0,160))}${item.text.length>160?'…':''}</p><div class="actions"><button class="btn secondary" data-open-passage="${esc(item.id)}">열기 · 풀기 →</button><button class="btn danger" data-delete-passage="${esc(item.id)}">삭제</button></div></article>`).join(''):'<div class="empty">아직 저장한 지문이 없어요.<br>위에서 첫 지문을 추가해 보세요.</div>'}</div>
    <p class="footer-note">사진은 AI 요청 중에만 사용하고 원본 이미지를 저장하지 않아요. 이미지에서 읽은 지문을 확인한 뒤 문제를 풀어 보세요. 사용자가 보내지 않은 지문은 추가하지 않습니다.</p>`, 'mine');
  const draftInput=document.createElement('input');draftInput.type='hidden';draftInput.id='passageDraftId';document.getElementById('passageForm').append(draftInput);
  if(imagePreviewUrl)releaseImagePreview();
  document.getElementById('passageImage').addEventListener('change',event=>previewSelectedImage(event.target.files?.[0]));
  document.getElementById('passageForm').addEventListener('submit',async event=>{
    event.preventDefault();const title=document.getElementById('passageTitle').value.trim();const text=document.getElementById('passageText').value.trim();const file=document.getElementById('passageImage').files?.[0];const notice=document.getElementById('generationMessage');
    if((!text&&!file)||(text&&file)){notice.classList.add('error');notice.textContent=text?'지문 직접 입력과 사진 중 한 가지만 선택해 주세요.':'지문을 붙여넣거나 사진을 선택해 주세요.';return;}
    if(text&&(text.length<40||text.length>6000)){notice.classList.add('error');notice.textContent='지문은 40~6,000자로 입력해 주세요.';return;}
    const draftInput=document.getElementById('passageDraftId'),item={id:draftInput.value||`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title,text,createdAt:new Date().toISOString(),questions:[]};draftInput.value=item.id;
    if(file){const button=document.getElementById('generateButton');if(button)button.disabled=true;notice.classList.remove('error');notice.innerHTML='<span class="spinner"></span>사진을 읽을 수 있게 준비하고 있어요…';try{const image=await preparePassageImage(file);await generatePassage(item,image);}catch(error){notice.classList.add('error');notice.textContent=error.message||'사진을 처리하지 못했어요.';if(button)button.disabled=false;}}
    else await generatePassage(item);
  });
  document.querySelectorAll('[data-open-passage]').forEach(button=>button.addEventListener('click',()=>{history.replaceState(null,'',`?passage=${encodeURIComponent(button.dataset.openPassage)}`);mine();}));
  document.querySelectorAll('[data-delete-passage]').forEach(button=>button.addEventListener('click',()=>deletePassage(button.dataset.deletePassage)));
  if(source){const play=document.getElementById('playSaved');if(play)play.onclick=()=>startQuiz(makeMixedSet(source.questions,source.questions.length,source.title));document.getElementById('retryGenerate').onclick=()=>generatePassage(source);document.getElementById('deletePassage').onclick=()=>deletePassage(source.id);}
}
async function generatePassage(item,imageData=null) {
  if(!imageData&&(item.text.length<40||item.text.length>6000)){const notice=document.getElementById('generationMessage');if(notice){notice.classList.add('error');notice.textContent='지문은 40~6,000자로 넣어 주세요.';}return;}
  if(!imageData){const existing=passages.findIndex(entry=>entry.id===item.id);if(existing<0)passages.unshift(item);else passages[existing]={...passages[existing],...item};storePassages();}
  const button=document.getElementById('generateButton');if(button)button.disabled=true;
  const message=document.getElementById('generationMessage');if(message){message.classList.remove('error');message.innerHTML='<span class="spinner"></span>지문을 읽고, 근거가 있는 문제를 만들고 있어요.';}
  try {
    const response=await fetch(apiEndpoint('/api/generate'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:item.title,passage:imageData?'':item.text,...(imageData?{image:imageData}:{})})});
    let data={};try{data=await response.json();}catch{}
    if(response.status===405)throw new Error(await explain405());
    if(!response.ok){
      if(imageData&&typeof data.passage==='string'&&data.passage.trim()){
        const extracted=data.passage;document.getElementById('passageText').value=extracted;document.getElementById('passageImage').value='';previewSelectedImage(null);
        const draft={...item,text:extracted};const index=passages.findIndex(entry=>entry.id===item.id);if(index<0)passages.unshift(draft);else passages[index]={...passages[index],...draft};storePassages();
        throw new Error(`${data.error||'아직 5개 문제를 만들지 못했어요.'} 사진에서 읽은 지문을 입력란에 옮겼습니다. 확인·수정한 뒤 ‘문제 만들기’를 다시 눌러 주세요.`);
      }
      throw new Error(data.error||`문제 생성에 실패했어요. (${response.status})`);
    }
    if(!Array.isArray(data.questions)||data.questions.length<1)throw new Error('문제를 받지 못했어요. 지문을 확인하고 다시 시도해 주세요.');
    const sourceText=typeof data.passage==='string'&&data.passage?data.passage:item.text;
    const questions=data.questions.map(q=>({...q,p:sourceText,c:`내 지문 · ${item.title}`,sourceId:item.id}));
    const saved={...item,text:sourceText,questions,generatedAt:new Date().toISOString()};const ix=passages.findIndex(entry=>entry.id===item.id);if(ix<0)passages.unshift(saved);else passages[ix]={...passages[ix],...saved};storePassages();releaseImagePreview();history.replaceState(null,'',`?passage=${encodeURIComponent(item.id)}`);mine('지문에 맞는 문제가 준비됐어요.');
  } catch(error) { if(message){message.classList.add('error');message.textContent=`${error.message||'문제 생성에 실패했어요.'}${imageData?'':' 지문은 저장했으니 다시 시도할 수 있어요.'}`;}if(button)button.disabled=false; }
}
function deletePassage(id) { if(!confirm('이 지문과 생성한 문제를 삭제할까요?'))return;passages=passages.filter(item=>item.id!==id);storePassages();history.replaceState(null,'',location.pathname);mine('지문을 삭제했어요.'); }
function showProfile(edit=false) {
  $.innerHTML=`<div class="panel setup center"><img src="icon-192.png" alt="우리 국어하자 로고"><div class="eyebrow" style="margin-top:18px">WOORI KOREAN STUDY</div><h1>${edit?'닉네임 바꾸기':'우리, 국어하자'}</h1><p class="subheading">${edit?'새 닉네임을 입력해 주세요.':'공부 기록과 친구 비교에 사용할 닉네임을 정해 주세요.'}</p><form id="profileForm"><input id="nickname" maxlength="12" placeholder="닉네임 (1~12자)" value="${esc(profile.nick)}" required><button class="btn" style="width:100%;margin-top:14px">${edit?'저장':'시작하기'}</button></form>${edit?'<button class="btn secondary" style="width:100%;margin-top:8px" id="cancelEdit">취소</button>':''}</div>`;
  document.getElementById('profileForm').addEventListener('submit',event=>{event.preventDefault();const nick=document.getElementById('nickname').value.trim().slice(0,12);if(!nick)return;profile={...profile,nick,id:profile.id||uidCode()};LS.set('mc_p',profile);syncOwnRecord().catch(()=>{});home();});
  const cancel=document.getElementById('cancelEdit');if(cancel)cancel.onclick=home;
}
function startQuiz(items) { if(!items.length){activeTab==='spelling'?spelling():passageHome('선택한 항목에는 준비된 문제가 없어요.');return;}quiz={items,index:0,correct:0,wrong:[],answered:false};renderQuestion();window.scrollTo({top:0,behavior:'smooth'}); }
function renderQuestion() {
  const item=quiz.items[quiz.index];quiz.answered=false;
  const labels=['①','②','③','④','⑤'];
  shell(`<div class="quiz"><button class="back" id="exitQuiz">← 학습 메뉴</button><div class="quiz-top"><span>${esc(item.section||item.c)}</span><span>${quiz.index+1} / ${quiz.items.length}</span></div><div class="bar"><i style="width:${Math.round(quiz.index/quiz.items.length*100)}%"></i></div><article class="quiz-card"><span class="tag">${esc(item.c||'내 지문')}</span>${item.p?`<div class="passage">${esc(item.p)}</div>`:''}<div class="question">${esc(item.q)}</div><div>${item.o.map((option,index)=>`<button class="option" data-answer="${index}"><b>${labels[index]||`${index+1}.`}</b>　${esc(option)}</button>`).join('')}</div><div id="feedback"></div></article></div>`,activeTab);
  document.getElementById('exitQuiz').onclick=()=>openTab(activeTab==='spelling'?'spelling':activeTab==='mine'?'mine':'passages');
  document.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>answer(+button.dataset.answer)));
}
function answer(choice) {
  if(quiz.answered)return;quiz.answered=true;const item=quiz.items[quiz.index],isCorrect=choice===item.a;
  if(isCorrect)quiz.correct++;else quiz.wrong.push({...item,userAnswer:choice});record(item.c||item.section,isCorrect);
  document.querySelectorAll('[data-answer]').forEach(button=>{button.disabled=true;const value=+button.dataset.answer;if(value===item.a)button.classList.add('correct');else if(value===choice)button.classList.add('wrong');});
  const feedback=document.getElementById('feedback');feedback.innerHTML=`<div class="explanation"><strong>${isCorrect?'맞았어요!':'아쉬워요. 다시 짚어 봐요.'}</strong><br>${esc(item.e||'정답을 확인했어요.')}${!isCorrect?`<br><br><b>정답:</b> ${esc(item.o[item.a])}`:''}</div><div class="actions"><button class="btn" id="nextQuestion">${quiz.index+1<quiz.items.length?'다음 문제 →':'결과 보기 →'}</button></div>`;
  document.getElementById('nextQuestion').onclick=()=>{quiz.index++;quiz.index<quiz.items.length?renderQuestion():renderResult();};
}
function renderResult() {
  const total=quiz.items.length,accuracy=pct(quiz.correct,total),wrong=[...quiz.wrong];
  shell(`${heading('STUDY RESULT','잘 풀었어요!','문제를 풀고 정답과 해설을 확인했어요.')}
  <section class="panel center"><div class="eyebrow">이번 학습 결과</div><div class="score">${quiz.correct} / ${total}</div><p class="subheading">정답률 ${accuracy}% · 틀린 문제 ${wrong.length}개</p><div class="actions" style="justify-content:center"><button class="btn" id="again">다른 문제 풀기 →</button><button class="btn secondary" id="toHome">홈으로</button>${wrong.length?'<button class="btn secondary" id="retryWrong">틀린 문제 다시 풀기</button>':''}</div></section>
  ${wrong.length?`<div class="section-head"><div><h2>복습할 문제</h2><p>틀린 문제와 해설을 한 번 더 살펴보세요.</p></div></div>${wrong.map(item=>`<article class="panel result-card"><span class="tag">${esc(item.c)}</span><div class="question">${esc(item.q)}</div>${item.p?`<div class="passage">${esc(item.p)}</div>`:''}<div class="explanation"><b>정답:</b> ${esc(item.o[item.a])}<br>${esc(item.e)}</div></article>`).join('')}`:'<div class="notice">모두 맞았어요. 새 문제로 한 번 더 연습해 보세요!</div>'}`,activeTab);
  document.getElementById('toHome').onclick=()=>openTab('home');document.getElementById('again').onclick=()=>openTab(activeTab);
  const retry=document.getElementById('retryWrong');if(retry)retry.onclick=()=>startQuiz(shuffle(wrong).map(({userAnswer,...item})=>item));
}
function statsPage() {
  const days=[];for(let i=6;i>=0;i--){const day=new Date();day.setDate(day.getDate()-i);days.push([day.toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}),stats.d[dateKey(day)]||[0,0]]);}
  const peak=Math.max(1,...days.map(([,value])=>value[0]));const kinds=Object.entries(stats.k||{});
  shell(`${heading('MY PROGRESS',`${profile.nick}님의 학습 기록`,'공부한 만큼 쌓이는 기록이에요.')}
    <div class="stats"><div class="stat"><b>${stats.t}</b>푼 문제</div><div class="stat"><b>${pct(stats.c,stats.t)}%</b>정답률</div><div class="stat"><b>${streak()}일</b>연속 학습</div></div>
    <div class="section-head"><div><h2>최근 7일</h2><p>하루하루의 연습량이에요.</p></div></div><section class="panel">${days.map(([label,value])=>`<div class="row"><span style="width:58px">${label}</span><div class="rb"><i style="width:${value[0]/peak*100}%"></i></div><span style="width:46px;text-align:right">${value[0]}문제</span></div>`).join('')}</section>
    <div class="section-head"><div><h2>유형별 정답률</h2><p>어떤 조항을 더 연습할지 살펴보세요.</p></div></div><section class="panel">${kinds.length?kinds.map(([name,value])=>`<div class="row"><span style="width:190px">${esc(name)}</span><div class="rb"><i style="width:${pct(value[1],value[0])}%"></i></div><span style="width:55px;text-align:right">${pct(value[1],value[0])}%</span></div>`).join(''):'<div class="empty">아직 푼 문제가 없어요.</div>'}</section>
    <div class="actions"><button class="btn danger" id="resetStats">학습 기록 초기화</button><button class="btn secondary" id="editProfile">닉네임 변경</button></div>`, 'stats');
  document.getElementById('resetStats').onclick=()=>{if(confirm('이 기기의 학습 기록을 모두 지울까요? 지운 기록은 되돌릴 수 없어요.')){stats={t:0,c:0,k:{},d:{}};persistStats();statsPage();}};
  document.getElementById('editProfile').onclick=()=>showProfile(true);
}
function friendsPage(message='') {
  if(firebaseEnabled())return renderFirebaseFriends(message);
  const rows=[snapshot(),...friends].sort((a,b)=>friendValue(b)-friendValue(a));
  shell(`${heading('STUDY TOGETHER','친구와 같이','코드를 주고받아 공부 기록을 비교해요.')}
    <section class="panel"><div class="panel-title"><h2>내 친구 코드</h2><span class="tag">공유하면 친구가 기록을 볼 수 있어요</span></div><div class="friend-code">${esc(legacyCode())}</div><button class="btn secondary" id="copyFriend">코드 복사</button></section>
    <section class="panel"><div class="panel-title"><h2>친구 추가</h2></div><textarea id="friendCodeInput" rows="3" placeholder="친구가 보내 준 코드를 붙여 넣으세요"></textarea><button class="btn" id="addFriend">친구 코드 추가</button><div class="message">${esc(message)}</div></section>
    <div class="section-head"><div><h2>학습 비교</h2><p>푼 문제 수, 정답률, 최근 일주일을 비교해요.</p></div></div><div class="chips">${[['total','푼 문제 수'],['accuracy','정답률'],['week','최근 7일']].map(([key,label])=>`<button class="chip ${friendSort===key?'on':''}" data-sort="${key}">${label}</button>`).join('')}</div>
    <section class="panel">${rows.map((row,index)=>`<div class="friends-row"><span class="avatar">${index+1}</span><div><strong>${esc(row.n)}${row.id===profile.id?' (나)':''}</strong><div class="small">총 ${row.t}문제 · 정답률 ${pct(row.c,row.t)}% · 7일 ${row.w}문제</div></div>${row.id!==profile.id?`<button class="chip" data-remove-friend="${esc(row.id)}">삭제</button>`:''}</div>`).join('')}</section>
    <div class="notice">친구 기능은 동일한 사용자 ID 형식을 보존합니다. Firebase 설정이 있을 때 기록 동기화를 시도하고, 연결되지 않으면 기기에 저장된 기록을 사용해요.</div>`, 'friends');
  document.getElementById('copyFriend').onclick=async()=>{try{await navigator.clipboard.writeText(legacyCode());friendsPage('친구 코드가 복사됐어요.');}catch{friendsPage('코드를 길게 눌러 복사해 주세요.');}};
  document.getElementById('addFriend').onclick=()=>{const code=document.getElementById('friendCodeInput').value.trim();try{const payload=decodeLegacyCode(code);if(payload.id===profile.id)return friendsPage('내 코드예요. 친구의 코드를 입력해 주세요.');friends=friends.filter(friend=>friend.id!==payload.id);friends.push(payload);LS.set('mc_f2',friends);friendsPage(`${payload.n} 님을 친구로 추가했어요.`);}catch{friendsPage('코드를 읽을 수 없어요. 친구 코드 전체를 다시 확인해 주세요.');}};
  document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{friendSort=button.dataset.sort;friendsPage();});
  document.querySelectorAll('[data-remove-friend]').forEach(button=>button.onclick=()=>{friends=friends.filter(friend=>friend.id!==button.dataset.removeFriend);LS.set('mc_f2',friends);friendsPage('친구를 목록에서 삭제했어요.');});
}
function friendValue(row) { return friendSort==='accuracy'?pct(row.c,row.t):friendSort==='week'?row.w:row.t; }
function legacyCode() { return `MC1-${btoa(unescape(encodeURIComponent(JSON.stringify(snapshot())))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`; }
function decodeLegacyCode(value) { if(value.startsWith('MC1-')){let code=value.slice(4).replace(/-/g,'+').replace(/_/g,'/');while(code.length%4)code+='=';const entry=JSON.parse(decodeURIComponent(escape(atob(code))));return {id:String(entry.i||entry.id||'').replace(/[^A-Za-z0-9]/g,'').slice(0,16),n:String(entry.n||'친구').slice(0,12),t:+entry.t||0,c:+entry.c||0,w:+entry.w||0,x:+entry.x||0,u:String(entry.u||'').slice(0,10)};}const cleaned=value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-HJ-NP-Z2-9]{8}$/.test(cleaned))throw new Error('bad code');const entry=friends.find(friend=>friend.code===cleaned);if(!entry)throw new Error('code unavailable');return entry; }
function fbEndpoint(code='') { return `https://firestore.googleapis.com/v1/projects/${firebase.projectId}/databases/(default)/documents/users/${code}`; }
function fbString(value) { return {stringValue:String(value)}; }
function fbInt(value) { return {integerValue:String(value|0)}; }
async function fbToken() {
  const now=Date.now();let auth=LS.get('mc_a',null);
  if(auth?.idToken&&auth.exp>now+60000)return auth.idToken;
  if(auth?.refreshToken){const refresh=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebase.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`});if(refresh.ok){const data=await refresh.json();auth={idToken:data.id_token,refreshToken:data.refresh_token,uid:data.user_id,exp:now+(+data.expires_in)*1000};LS.set('mc_a',auth);return auth.idToken;}}
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebase.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});if(!response.ok)throw new Error('Firebase sign-in failed');
  const data=await response.json();auth={idToken:data.idToken,refreshToken:data.refreshToken,uid:data.localId,exp:now+(+data.expiresIn)*1000};LS.set('mc_a',auth);return auth.idToken;
}
async function syncOwnRecord() { if(!firebaseEnabled()||!profile.nick)return;try{if(!profile.code){profile={...profile,code:uidCode()};LS.set('mc_p',profile);}const token=await fbToken(),auth=LS.get('mc_a',{}),week=lastSeven(),payload={fields:{o:fbString(auth.uid),n:fbString(profile.nick),t:fbInt(stats.t),c:fbInt(stats.c),w:fbInt(week[0]),x:fbInt(week[1]),u:fbString(dateKey(new Date()))}},mask=['o','n','t','c','w','x','u'].map(key=>`updateMask.fieldPaths=${key}`).join('&');const response=await fetch(`${fbEndpoint(profile.code)}?${mask}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`Firebase ${response.status}`);}catch(error){console.warn('친구 기록 동기화를 기다리는 중입니다.',error.message);} }
async function fetchFriend(code) { const token=await fbToken(),response=await fetch(fbEndpoint(code),{headers:{Authorization:`Bearer ${token}`}});if(response.status===404)return null;if(!response.ok)throw new Error(`Firebase ${response.status}`);const fields=(await response.json()).fields||{},read=key=>fields[key]?.integerValue??fields[key]?.stringValue??'';return {code,id:code,n:String(read('n')).slice(0,12),t:+read('t')||0,c:+read('c')||0,w:+read('w')||0,x:+read('x')||0,u:String(read('u')).slice(0,10)}; }
async function renderFirebaseFriends(message='') {
  activeTab='friends'; shell(`${heading('STUDY TOGETHER','친구 기록','Firebase에 연결된 친구와 공부 기록을 비교해요.')}<div class="notice"><span class="spinner"></span>친구 기록을 불러오고 있어요.</div>`,'friends');let note='';
  try{if(!profile.code){profile={...profile,code:uidCode()};LS.set('mc_p',profile);}await syncOwnRecord();}catch{note='내 기록 동기화가 잠시 지연되고 있어요.';}
  const stored=LS.get('mc_f2',[]),loaded=await Promise.all(stored.map(async friend=>{try{return await fetchFriend(friend.code)||friend;}catch{note=note||'일부 친구 기록을 가져오지 못해 저장된 기록을 보여 드려요.';return friend;}}));friends=loaded;LS.set('mc_f2',friends);
  const rows=[snapshot(),...friends].sort((a,b)=>friendValue(b)-friendValue(a));
  shell(`${heading('STUDY TOGETHER','친구 기록','Firebase에 연결된 친구와 공부 기록을 비교해요.')}
    <section class="panel"><div class="panel-title"><h2>내 친구 코드</h2><span class="tag">기록은 자동 동기화돼요</span></div><div class="friend-code">${esc(profile.code?.slice(0,4)+'-'+profile.code?.slice(4)||'잠시 후 새로고침')}</div><button class="btn secondary" id="copyFirebaseCode">코드 복사</button></section>
    <section class="panel"><h2 style="margin-top:0">친구 추가</h2><input id="firebaseFriendCode" maxlength="12" placeholder="친구 코드 (8자리)" autocapitalize="characters"><button class="btn" id="addFirebaseFriend">친구 추가</button><div class="message ${note?'error':''}" id="friendMessage">${esc(message||note)}</div></section>
    <div class="section-head"><div><h2>학습 비교</h2><p>푼 문제 수, 정답률, 최근 일주일을 비교해요.</p></div></div><div class="chips">${[['total','푼 문제 수'],['accuracy','정답률'],['week','최근 7일']].map(([key,label])=>`<button class="chip ${friendSort===key?'on':''}" data-sort="${key}">${label}</button>`).join('')}</div>
    <section class="panel">${rows.map((row,index)=>`<div class="friends-row"><span class="avatar">${index+1}</span><div><strong>${esc(row.n)}${row.id===profile.id?' (나)':''}</strong><div class="small">총 ${row.t}문제 · 정답률 ${pct(row.c,row.t)}% · 7일 ${row.w}문제</div></div>${row.id!==profile.id?`<button class="chip" data-remove-firebase="${esc(row.code)}">삭제</button>`:''}</div>`).join('')}</section>
    <div class="notice">친구 코드에는 친구가 공유하기로 한 닉네임과 학습 통계만 표시돼요.</div>`, 'friends');
  document.getElementById('copyFirebaseCode').onclick=async()=>{try{await navigator.clipboard.writeText(profile.code);friendsPage('친구 코드가 복사됐어요.');}catch{friendsPage('코드를 길게 눌러 복사해 주세요.');}};
  document.getElementById('addFirebaseFriend').onclick=async()=>{const code=document.getElementById('firebaseFriendCode').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))return friendsPage('친구 코드는 알파벳과 숫자 8자리예요.');if(code===profile.code)return friendsPage('내 코드예요. 친구의 코드를 입력해 주세요.');const button=document.getElementById('addFirebaseFriend');button.disabled=true;try{const friend=await fetchFriend(code);if(!friend)return friendsPage('등록된 친구 코드를 찾을 수 없어요. 다시 확인해 주세요.');friends=LS.get('mc_f2',[]).filter(entry=>entry.code!==code);friends.push(friend);LS.set('mc_f2',friends);friendsPage(`${friend.n} 님을 친구로 추가했어요.`);}catch{friendsPage('연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');}};
  document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{friendSort=button.dataset.sort;friendsPage();});
  document.querySelectorAll('[data-remove-firebase]').forEach(button=>button.onclick=()=>{friends=LS.get('mc_f2',[]).filter(friend=>friend.code!==button.dataset.removeFirebase);LS.set('mc_f2',friends);friendsPage('친구를 목록에서 삭제했어요.');});
}
function legacyCode(){const info=snapshot();info.i=info.id;return `MC1-${btoa(unescape(encodeURIComponent(JSON.stringify(info)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;}
function init(){if(!profile.nick){showProfile();return;}home();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});}
init();
})();
