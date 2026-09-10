/* ============================================================
 * 《千年一眼：从金源到抗联》游戏引擎
 * 模式：手动试玩 / 自动演示（均完全本地运行）
 * ============================================================ */
(function () {
  'use strict';

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    bg: $('bg'), bgGrad: $('bgGrad'), particles: $('particles'),
    scene: $('scene'), actTag: $('actTag'), speaker: $('speaker'),
    line: $('line'), sub: $('sub'), caption: $('caption'),
    era: $('era'), modeTag: $('modeTag'), factbar: $('factbar'), plaque: $('plaque'),
    nextBtn: $('nextBtn'), choices: $('choices'),
    menu: $('menuOverlay'), transition: $('transitionOverlay'), transitionText: $('transitionText'),
    ending: $('endingOverlay'), endingTag: $('endingTag'), endingTitle: $('endingTitle'),
    endingVoice: $('endingVoice'), endingCount: $('endingCount'),
    credit: $('creditOverlay'),
    btnManual: $('btnManual'), btnAuto: $('btnAuto'), restartBtn: $('restartBtn'),
    btnTimeline: $('btnTimeline'), btnGallery: $('btnGallery'), btnFigures: $('btnFigures'),
    panel: $('panelOverlay'), panelBack: $('panelBack'), panelTabs: null, panes: null,
    paneTimeline: $('paneTimeline'), paneGallery: $('paneGallery'), paneFigures: $('paneFigures'),
    view: $('viewOverlay'), viewTag: $('viewTag'), viewTitle: $('viewTitle'),
    viewVoice: $('viewVoice'), viewFact: $('viewFact'), viewHint: $('viewHint'),
    pause: $('pauseOverlay'), pauseTitle: $('pauseTitle'), pauseMeta: $('pauseMeta'),
    pauseProg: $('pauseProg'),
    btnResume: $('btnResume'), btnPauseRestart: $('btnPauseRestart'),
    btnPauseTimeline: $('btnPauseTimeline'), btnPauseGallery: $('btnPauseGallery'),
    btnPauseMenu: $('btnPauseMenu'),
    btnPauseActs: $('btnPauseActs'), btnRecall: $('btnRecall'), btnPrefs: $('btnPrefs'),
    pzActs: $('pzActs'), pzActList: $('pzActList'),
    pzRecall: $('pzRecall'), pzRecallList: $('pzRecallList'),
    pzPrefs: $('pzPrefs'), pzPrefsBox: $('pzPrefsBox')
  };

  // 图片层（双图层：换 AI 背景图时交叉淡入，不硬切）
  var bgImg = document.createElement('div');
  bgImg.id = 'bgImg';
  el.bg.appendChild(bgImg);
  var bgImgB = document.createElement('div');
  bgImgB.id = 'bgImgB';
  el.bg.appendChild(bgImgB);

  // ---------- 全局状态 ----------
  var S = {
    mode: 'manual',        // manual | auto
    actIdx: 0,
    phase: 'menu',         // titlecard|intro|frames|question|goodpreview|ending|transition|final|credit
    fIdx: 0,
    typing: false,
    particles: []
  };

  // ---------- 播放偏好（逐字速度 / 自动节奏 / 字幕开关，localStorage 持久化） ----------
  var PREF_LS = 'qiannian_pref_v1';
  var RATE = { type: 1, auto: 1 };              // 乘数：type=逐字速度, auto=自动推进停顿
  var PREF_TYPE = { slow: 0.7, normal: 1, fast: 1.6 };
  var PREF_AUTO = { slow: 1.8, normal: 1, fast: 0.55 };
  var prefs = { type: 'normal', auto: 'normal', sub: true };
  function loadPrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem(PREF_LS) || 'null');
      if (raw && raw.type && PREF_TYPE[raw.type]) prefs.type = raw.type;
      if (raw && raw.auto && PREF_AUTO[raw.auto]) prefs.auto = raw.auto;
      if (raw && typeof raw.sub === 'boolean') prefs.sub = raw.sub;
    } catch (e) {}
    applyPrefs();
  }
  function savePrefs() { try { localStorage.setItem(PREF_LS, JSON.stringify(prefs)); } catch (e) {} }
  function applyPrefs() {
    RATE.type = PREF_TYPE[prefs.type];
    RATE.auto = PREF_AUTO[prefs.auto];
    document.body.dataset.sub = prefs.sub ? 'on' : 'off';
  }
  function setPref(k, v) { prefs[k] = v; applyPrefs(); savePrefs(); }
  loadPrefs();   // 载入即应用（含字幕开关）

  // ---------- 本幕台词回看记录 ----------
  var RECALL = [];
  var RECALL_MAX = 80;
  function recallReset() { RECALL = []; }
  function recallTrack(node, text) {
    // 只收“正文台词行”（el.line）的逐字内容；转场大字、结束语等不进回看
    if (node !== el.line || !text) return;
    var who = el.speaker.textContent || '叙述';
    RECALL.push({ who: who, text: text });
    if (RECALL.length > RECALL_MAX) RECALL.shift();
  }
  function recallPush(text) {
    if (!text) return;
    // 抉择提问可能重来多次，去重相邻同文本
    var last = RECALL[RECALL.length - 1];
    if (last && last.who === '抉择' && last.text === text) return;
    RECALL.push({ who: '抉择', text: text });
    if (RECALL.length > RECALL_MAX) RECALL.shift();
  }

  // ---------- 工具 ----------
  // 可冻结计时器：所有推进延时 / 逐字打字节拍都登记在 _pend。
  // 播放暂停时把整支队列“停表”（记住已走时间），继续后按剩余时间恢复，实现无缝真暂停。
  var _pend = [];
  var _paused = false;
  function _mkRec(fn, ms) {
    var rec = { fn: fn, ms: ms, remain: ms, t0: Date.now(), t: 0 };
    _pend.push(rec);
    rec.t = setTimeout(function () {
      var i = _pend.indexOf(rec); if (i >= 0) _pend.splice(i, 1);
      rec.fn();
    }, rec.ms);
    return rec;
  }
  // 剧情推进延时：自动演示下再乘“节奏倍率”（手动模式恒为 1）
  function later(fn, ms) {
    if (S.mode === 'auto') ms = Math.round(ms * RATE.auto);
    return _mkRec(fn, ms);
  }
  // 内部节拍：不受自动节奏倍率影响（如结局 3 秒倒计时的逐秒 tick）
  function ticker(fn, ms) { return _mkRec(fn, ms); }
  function clearTimers() {
    _pend.forEach(function (r) { clearTimeout(r.t); });
    _pend = [];
    _paused = false;
  }
  function freezeEngine() {
    if (_paused) return;
    _paused = true;
    _pend.forEach(function (r) {
      if (r.t) {
        r.remain = r.ms - (Date.now() - r.t0);
        if (r.remain < 0) r.remain = 1;
        clearTimeout(r.t);
        r.t = 0;
      }
    });
  }
  function thawEngine() {
    if (!_paused) return;
    _paused = false;
    var now = Date.now();
    _pend.forEach(function (r) {
      if (r.t) return;
      r.ms = Math.max(1, Math.round(r.remain));
      r.t0 = now;
      r.t = setTimeout(function () {
        var i = _pend.indexOf(r); if (i >= 0) _pend.splice(i, 1);
        r.fn();
      }, r.ms);
    });
  }
  function stopType() { S.typing = false; }
  function hide(idEl) { idEl.classList.remove('show'); idEl.classList.add('hidden'); }
  function show(idEl) { idEl.classList.remove('hidden'); idEl.classList.add('show'); }

  function setMood(mood, pal) {
    document.body.className = '';
    document.body.classList.add('mood-' + (mood || 'dust'));
    if (pal) {
      el.bgGrad.style.setProperty('--sky', pal.sky);
      el.bgGrad.style.setProperty('--sky2', pal.sky2);
      el.bgGrad.style.setProperty('--deep', pal.deep);
    }
  }

  // ---------- 推进锁：保证“每点一下只有一个变化”（防双击/连点跳帧） ----------
  var _lastTap = 0;
  function commitAdvance(fn) {
    var now = Date.now();
    if (now - _lastTap < 360) return;   // 360ms 内重复点击忽略
    _lastTap = now;
    fn();
  }

  // 轻淡入辅助（新字幕 / 大字）
  function popFade(node) {
    if (!node) return;
    node.classList.remove('fadeSoft');
    void node.offsetWidth;
    node.classList.add('fadeSoft');
  }
  function setSub(t) { el.sub.textContent = t || ''; if (t) popFade(el.sub); }

  // ---------- 背景：氛围渐变 与 AI 图片层 交叉淡入 ----------
  var bgLayers = [bgImg, bgImgB];
  var curOn = -1;      // 当前可见图片层下标（-1 = 无图片，走氛围渐变）
  var shotSeq = 0;     // 切换令牌：防止过期的图片 onload 覆盖新切换
  // 本作 AI 图多为 1.5:1 横图。当视口比图更宽（如 16:9、21:9、横屏大屏）时，
  // cover 会纵向放大裁掉上下的主体（人脸多居上），此时贴顶对齐；图比视口宽时
  // 保持垂直居中即可（此时横向裁切，不伤主体）。
  function refitBackdrops() {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!(vw > 0 && vh > 0)) return;
    bgLayers.forEach(function (l) {
      var w = parseFloat(l.dataset.w || ''), h = parseFloat(l.dataset.h || '');
      if (w > 0 && h > 0)
        l.style.backgroundPosition = (vw / vh) > (w / h) ? 'center top' : 'center center';
    });
  }
  window.addEventListener('resize', refitBackdrops);
  window.addEventListener('orientationchange', refitBackdrops);
  function crossfadeBackdrop(imgPath) {
    var seq = ++shotSeq;
    if (!imgPath) {
      // 切回程序化氛围背景
      bgGrad.style.opacity = '1';
      if (curOn >= 0) { bgLayers[curOn].classList.remove('on'); curOn = -1; }
      return;
    }
    // 选空闲层承载新图；等图片加载完成后再交叉淡入（避免白屏）
    var next = bgLayers[curOn === 0 ? 1 : 0];
    var img = new Image();
    var apply = function () {
      if (seq !== shotSeq) return;
      next.style.backgroundImage = 'url("' + imgPath + '")';
      next.dataset.w = img.naturalWidth || '';
      next.dataset.h = img.naturalHeight || '';
      refitBackdrops();
      if (curOn >= 0) bgLayers[curOn].classList.remove('on');
      next.classList.add('on');
      bgGrad.style.opacity = '0';
      curOn = next === bgLayers[0] ? 0 : 1;
    };
    img.onload = apply;
    img.onerror = apply;      // 加载失败也照常切换，避免卡住
    img.src = imgPath;
  }
  function preloadShot(path) { if (path) { var im = new Image(); im.src = path; } }

  function useBackdrop(mood, pal, imgPath) {
    setMood(mood, pal);
    crossfadeBackdrop(imgPath || '');
    spawnParticles(mood);
  }

  // 进入黑幕（报幕标题卡/片名字幕）前的底层处理：
  // 背景换色本身有 1.2s 渐变，而黑幕 600ms 就会淡入盖满——
  // 若直接改色，黑幕半透明的那段窗口会透出“正在渐变的旧画面”，形成一闪而过。
  // 因此这里临时禁用过渡：让底层在任何报幕黑幕出现前瞬间变纯黑、旧图即时退场，
  // 再恢复过渡，保证黑幕淡入时底下已无任何亮色可透。
  function blackout() {
    var g = el.bgGrad;
    g.style.transition = 'none';
    bgLayers.forEach(function (l) { l.style.transition = 'none'; l.classList.remove('on'); });
    setMood('black', { sky: '#000000', sky2: '#0b0b0d', deep: '#000000' });
    g.style.opacity = '1';
    curOn = -1;
    void g.offsetWidth;           // 强制 reflow，让“瞬时变黑”立即生效
    g.style.transition = '';
    bgLayers.forEach(function (l) { l.style.transition = ''; });
    spawnParticles('black');      // 纯黑幕不落粒子
  }

  // 粒子氛围
  var PCOUNT = { snow: 70, rain: 90, dust: 34, ember: 30, light: 44, mist: 9 };
  function clearParticles() {
    S.particles.forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); });
    S.particles = [];
  }
  function spawnParticles(mood) {
    clearParticles();
    if (mood === 'black') return;   // 纯黑幕不落粒子
    var n = PCOUNT[mood] || 20;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'p';
      var size = mood === 'rain' ? 1 : (mood === 'mist' ? 40 : 1.5 + Math.random() * 2.6);
      p.style.width = size + 'px';
      p.style.height = (mood === 'rain' ? 26 + Math.random() * 22 : size) + 'px';
      p.style.left = Math.random() * 102 - 1 + 'vw';
      p.style.setProperty('--po', (mood === 'mist' ? 0.5 : 0.35 + Math.random() * 0.4).toFixed(2));
      var dur = mood === 'rain' ? 1.2 + Math.random() * 1.4
              : mood === 'mist' ? 16 + Math.random() * 14
              : 7 + Math.random() * 9;
      p.style.animationDuration = dur + 's';
      p.style.animationDelay = (-Math.random() * dur) + 's';
      if (mood === 'rain') p.style.animationDuration = dur + 's';
      el.particles.appendChild(p);
      S.particles.push(p);
    }
  }

  // ---------- 打字机 ----------
  var lastType = null;   // 最近一次逐字任务：点“继续”/正文时立即补全全文
  function typeInto(node, text, cps, done) {
    clearTimers(); stopType();
    node.textContent = '';
    if (!text) { lastType = null; if (done) done(); return; }
    lastType = { node: node, text: text };
    popFade(node);
    S.typing = true;
    var i = 0;
    var speed = 1000 / Math.max(1, cps * RATE.type);
    function step() {
      if (!S.typing) { lastType = null; if (done) done(); return; }
      i++;
      node.textContent = text.slice(0, i);
      if (i < text.length) {
        ticker(step, speed);       // 可冻结打字节拍
      } else {
        S.typing = false;
        lastType = null;
        if (done) done();
      }
    }
    ticker(step, 60);
    recallTrack(node, text);   // 若为本幕正文台词行，写入回看记录
  }

  // ---------- 文本可见性 ----------
  // 字幕容器三种形态：box=对话框 / plain=无框浮字 / 空=隐藏
  function captionShow(mode) {
    if (!el.caption) return;
    el.caption.classList.toggle('box', mode === 'box');
    el.caption.classList.toggle('plain', mode === 'plain');
  }
  function clearScene() {
    el.line.textContent = '';
    el.line.onclick = null;
    el.line.style.minHeight = '';
    el.line.style.fontSize = '';
    el.line.style.letterSpacing = '';
    el.line.style.color = '';
    el.speaker.textContent = '';
    el.speaker.classList.remove('show');
    el.sub.textContent = '';
    el.caption.onclick = null;
    captionShow('');
    hide(el.nextBtn);
    el.choices.innerHTML = '';
  }

  function showSpeaker(name) {
    if (name) { el.speaker.textContent = name; el.speaker.classList.add('show'); }
    else el.speaker.classList.remove('show');
  }

  // ================= 主流程 =================
  function startGame(mode, fromIdx) {
    S.mode = mode;
    S.actIdx = fromIdx || 0;
    el.modeTag.textContent = mode === 'auto' ? '◆ 自动演示' : '▶ 手动试玩';
    el.restartBtn.textContent = '☰ 菜单';   // 手动/自动均可呼出暂停菜单（自动为真暂停）
    hide(el.menu);
    hide(el.panel);
    hide(el.view);
    hide(el.pause);
    clearTimers(); stopType(); clearScene();
    hide(el.transition);
    hide(el.ending);
    hide(el.credit);
    enterAct(S.actIdx);
  }

  function act() { return ACTS[S.actIdx]; }

  function enterAct(idx) {
    S.actIdx = idx;
    S.fIdx = 0;
    recallReset();   // 每幕重置“本幕台词回看”
    clearScene();
    var a = act();
    el.era.textContent = a.era;
    el.factbar.textContent = '史实依据：' + a.facts;
    // 幕标题卡（黑幕白字）：底层先瞬时切纯黑，黑幕淡入期间不透出上一幕/本幕任何画面
    S.phase = 'titlecard';
    blackout();
    el.actTag.textContent = a.title;
    showTitleCard(a.subtitle || a.title, a.era, function () {
      if (a.id === 'act0') { playAct0(); return; }
      // 标题卡结束：先切回本幕氛围背景，再播统一独白
      useBackdrop(a.mood, a.palette, '');
      // 统一独白
      S.phase = 'intro';
      showSpeaker('');
      el.actTag.textContent = a.title;
      el.sub.textContent = '';
      captionShow('box');   // 开场统一独白也走对话框
      var cps = S.mode === 'auto' ? 13 : 26;
      typeInto(el.line, INTRO_LINE, cps, function () {
        // 自动演示：打字完成自动进入正片；手动：停在全文，等点击“继续”
        if (S.mode === 'auto') afterIntro(a);
      });
      if (S.mode === 'manual') {
        el.nextBtn.classList.remove('hidden');
        el.nextBtn.textContent = '▼ 继续';
        bindOnceContinue(function () {
          if (S.typing) { finishType(); return; }   // 第一下：立即补全全文
          afterIntro(a);
        });
        // 点对话框同样：第一下补全全文，第二下进入正片
        el.caption.onclick = function () {
          commitAdvance(function () {
            if (S.typing) { finishType(); return; }
            afterIntro(a);
          });
        };
      }
    });
  }

  function finishType() {   // 立即补全当前打字（保留全文），不清空
    if (!lastType) return;
    stopType();
    if (lastType.text) lastType.node.textContent = lastType.text;
  }

  function showTitleCard(text, era, done) {
    el.transitionText.textContent = text + (era ? '\n' + era : '');
    show(el.transition);
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      el.transition.classList.remove('show');
      later(done, S.mode === 'auto' ? 550 : 420);
    };
    if (S.mode === 'manual') {
      // 手动：标题卡不自动播放，必须点“继续”/点画面才进入下一步
      el.nextBtn.classList.remove('hidden');
      el.nextBtn.textContent = '▼ 继续';
      bindOnceContinue(function () {
        if (!finished) { clearTimers(); finish(); }
      });
      el.transition.onclick = function () {
        commitAdvance(function () {
          if (!finished) { clearTimers(); finish(); }
        });
      };
    } else {
      el.transition.onclick = null;
      later(finish, 4600);   // 每幕大字标题卡：自动下多停留，读清“第几幕·地名/年份”
    }
  }

  function afterIntro(a) {
    hide(el.nextBtn);
    playFrame(0);
  }

  // 序章：直接播帧
  function playAct0() {
    S.phase = 'frames';
    hide(el.nextBtn);
    playFrame(0);
  }

  function playFrame(i) {
    S.fIdx = i;
    var a = act();
    var fr = a.frames[i];
    if (!fr) { afterFrames(a); return; }
    S.phase = 'frames';
    clearScene();
    el.actTag.textContent = a.title;
    showSpeaker(fr.speaker || '');
    el.sub.textContent = fr.sub || '';
    el.line.style.minHeight = fr.text ? 'auto' : '0';
    // 台词帧 → 对话框；纯分镜帧 → 无框浮字；两者皆无 → 隐藏
    captionShow(fr.kind === 'titlecard' ? 'plain'
      : (fr.speaker || fr.text ? 'box' : (fr.sub ? 'plain' : '')));

    // 统一推进动作：手动点击（正文 / 继续按钮）共用，避免两路重复收尾
    var goNext = function () {
      if (i < a.frames.length - 1) playFrame(i + 1);
      else afterFrames(a);
    };

    var after = function () {
      if (S.mode === 'manual') {
        // 打字完成：显示“继续”；点击进下帧或提问
        if (i < a.frames.length - 1 || a.autoNext || !a.choices) {
          el.nextBtn.classList.remove('hidden');
          bindOnceContinue(goNext);
        } else {
          // 末尾剧情帧读完：点“继续”才弹选项（不自动弹出）
          el.nextBtn.classList.remove('hidden');
          bindOnceContinue(goNext);
        }
      } else {
        // 自动：放慢帧间节奏，给足阅读时间
        var pause = fr.kind === 'titlecard' ? 2300 : (i < a.frames.length - 1 ? 1900 : 2200);
        later(goNext, pause);
      }
    };

    // 预载下一帧图片：换帧时图片已就绪，画面不白屏（整体流畅）
    if (a.frames[i + 1] && a.frames[i + 1].img) preloadShot(a.frames[i + 1].img);

    if (fr.kind === 'titlecard') {
      // 大字标题帧：瞬时切纯黑底，黑幕淡入不透出前一帧画面
      blackout();
      el.speaker.classList.remove('show');
      el.line.textContent = fr.text;
      recallTrack(el.line, fr.text);   // 标题帧文字也收进回看
      popFade(el.line);
      el.line.style.fontSize = 'clamp(26px, 6vh, 56px)';
      el.line.style.letterSpacing = '10px';
      el.line.style.color = '#f5efe0';
      if (S.mode === 'auto') {
        later(after, 2800);
      } else {
        el.nextBtn.classList.remove('hidden');
        bindOnceContinue(goNext);
      }
      return;
    }
    // 普通帧：渲染对应背景（AI 图片或程序化氛围）
    useBackdrop(a.mood, a.palette, fr.img);
    // 普通逐字
    el.line.style.fontSize = '';
    el.line.style.letterSpacing = '';
    el.line.style.color = '';
    if (fr.text) {
      var cps = S.mode === 'auto' ? 24 : 60;
      typeInto(el.line, fr.text, cps, after);
    } else if (S.mode === 'auto') {
      later(after, 1600);
    } else {
      // 手动：无文字帧不设任何自动计时，画面停住并立即出现“继续”
      after();
    }
    if (S.mode === 'manual') {
      // 点击对话框 = 一次点击、一个明确变化：
      //   打字中第 1 下 → 本句立即完整显示；再第 2 下 → 进入下一帧
      el.caption.onclick = function () {
        commitAdvance(function () {
          if (S.typing) {
            finishType();   // 第一下：立即补全本句全文
          } else if (i < a.frames.length - 1) {
            playFrame(i + 1);
          }
          // 末尾帧：交给“继续”按钮（打字完成后即出现），避免重复收尾
        });
      };
    }
  }

  function afterFrames(a) {
    hide(el.nextBtn);
    if (a.id === 'act0') {
      // 序章：删掉城墙图与第一幕标题之间的黑幕转场帧（“我又闭上了眼…”），
      // 帧播完直接接第一幕标题卡，不再多停一帧纯黑过渡
      enterAct(1);
      return;
    }
    if (a.autoNext || !a.choices) {
      S.phase = 'transition';
      showTransition(a.transition, function () {
        afterAllActs();
      });
      return;
    }
    showQuestion(a);
  }

  function showQuestion(a) {
    S.phase = 'question';
    clearScene();
    el.actTag.textContent = a.title;
    showSpeaker('');
    el.sub.textContent = '';
    // 提问引导
    el.line.textContent = a.qPrompt || '';
    if (a.qPrompt) { recallPush(a.qPrompt); popFade(el.line); }
    el.line.style.fontSize = '';
    captionShow('plain');   // 抉择引导不套框，避免与右侧选项卡挤占
    el.choices.innerHTML = '';
    a.choices.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.className = 'choice';
      // 不预透结局走向：选项上只展示行为描述与按键，结局在抉择后揭晓
      b.innerHTML = '<span class="label">' + ch.label + '</span><span class="key">' + ch.key + '</span>';
      b.addEventListener('click', function () { commitAdvance(function () { onChoose(a, ch); }); });
      el.choices.appendChild(b);
      setTimeout(function () { b.classList.add('on'); }, 120 + i * 130);
    });
    if (S.mode === 'auto') {
      // 自动选择正确项
      var good = a.choices.filter(function (c) { return c.kind === 'good' || c.kind === 'final'; })[0];
      later(function () { onChoose(a, good); }, 3400);
    }
  }

  function onChoose(a, ch) {
    if (S.phase !== 'question') return;
    S.phase = 'choosing';
    hideNextAndChoices();
    if (ch.kind === 'good') {
      playGoodPreview(a, ch);
    } else if (ch.kind === 'bad' || ch.kind === 'ending') {
      playEnding(ch, a);
    } else if (ch.kind === 'final') {
      playGoodPreview(a, ch, true);
    }
  }

  function hideNextAndChoices() {
    hide(el.nextBtn);
    var cs = el.choices.querySelectorAll('.choice');
    cs.forEach(function (c) { c.classList.remove('on'); });
    el.line.textContent = '';
  }

  // 正确选项的短暂反馈
  function playGoodPreview(a, ch, isFinal) {
    S.phase = 'goodpreview';
    if (isFinal) markSeen(a.id + ':' + ch.key);   // 第七幕 C：点亮“通往最终结局”收藏
    useBackdrop(ch.ending.mood, ch.ending.palette, ch.ending.img || '');
    el.endingTag.textContent = isFinal ? '最终结局 · 千年对话' : '你的选择 · 写入史册';
    el.endingTitle.textContent = isFinal ? '沿着阿什河漫步' : '';
    el.endingCount.textContent = '';
    el.endingTitle.style.display = isFinal ? 'none' : 'block';
    show(el.ending);
    showSpeaker('');
    var continueToNext = function () {
      // 瞬时隐藏结局层（display:none）：若让它 0.6s 缓慢淡出，会叠在下一幕
      // 标题黑幕的淡入窗口上，结局文字像“闪一下”一样浮在黑幕上消失
      hide(el.ending);
      if (isFinal) { playFinal(); return; }
      // 删掉幕间黑幕转场：正确结局预览播完直接进下一幕标题卡，与序章一致
      if (a.id === 'act7') { afterAllActs(); return; }
      enterAct(S.actIdx + 1);
    };
    typeInto(el.endingVoice, ch.ending.voice, S.mode === 'auto' ? 16 : 45, function () {
      if (S.mode === 'auto') { later(continueToNext, 2300); return; }
      // 手动：看完正确结局预览后停下，点“继续”/画面才进入下一幕
      el.nextBtn.classList.remove('hidden');
      el.nextBtn.textContent = '▼ 继续';
      bindOnceContinue(continueToNext);
      el.ending.onclick = function () {
        commitAdvance(function () {
          if (S.phase !== 'goodpreview') return;
          continueToNext();
        });
      };
    });
  }

  // 错误选项 → 结局画面 3 秒 → 回到本幕重选
  function playEnding(ch, a) {
    S.phase = 'ending';
    markSeen(a.id + ':' + ch.key);   // 点亮图鉴：见证“另一条历史的路”
    useBackdrop(ch.ending.mood, ch.ending.palette, ch.ending.img || '');
    el.endingTag.textContent = '结局 · ' + ch.tag;
    el.endingTitle.textContent = ch.tag;
    el.endingTitle.style.display = 'block';
    el.endingVoice.textContent = '';
    el.endingCount.textContent = '';
    show(el.ending);
    var goBack = function () {
      clearTimers(); stopType();
      hide(el.ending);   // 瞬时隐藏：避免残留淡出叠在回本幕的标题黑幕上
      el.ending.onclick = null;
      enterAct(S.actIdx);
    };
    // 提示文案：手动=点继续/画面返回；自动=倒计时返回
    el.endingCount.textContent = (ch.kind === 'ending')
      ? '再选一次，去看看另一个答案 →'
      : (S.mode === 'manual' ? '点击「继续」返回，重新选择 →' : '3 秒后回到本幕，重新选择');
    typeInto(el.endingVoice, ch.ending.voice, S.mode === 'auto' ? 16 : 45, function () {
      if (S.mode === 'auto') {
        var n = 3;
        var tick = function () {
          if (ch.kind === 'ending') { el.endingCount.textContent = '再选一次，去看看另一个答案 →'; later(goBack, 3000); return; }
          if (n > 0) { el.endingCount.textContent = n + ' 秒后回到本幕重选…'; n--; later(tick, 1000); return; }
          goBack();
        };
        later(tick, 800);
        return;
      }
      // 手动：看完整段后停下，点“继续”/画面才返回本幕重选
      el.nextBtn.classList.remove('hidden');
      el.nextBtn.textContent = '▼ 继续';
      bindOnceContinue(goBack);
    });
    // 手动模式：点画面也可返回
    if (S.mode === 'manual') {
      el.ending.onclick = function () {
        if (S.phase !== 'ending') return;
        commitAdvance(goBack);
      };
    }
  }

  // ---------- 转场 ----------
  function showTransition(text, done) {
    hide(el.nextBtn);
    // 转场黑幕应是一张“干净黑幕”：清掉上一幕残留的场景字幕/旁白/幕标签/事实栏，
    // 避免转场与下一幕标题之间叠着上一帧的字幕（如序章帧2 的“阿什河…”正文等）
    clearScene();
    el.actTag.textContent = '';
    el.factbar.textContent = '';
    el.transitionText.textContent = text;
    popFade(el.transitionText);
    show(el.transition);
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      // 转场黑幕撤下前先把底层瞬时清纯黑：黑幕淡出时露出的只能是黑，
      // 不会把上一帧画面（如序章 act0_2）透出来，实现黑幕间无缝切换
      blackout();
      el.transition.classList.remove('show');
      later(done, S.mode === 'auto' ? 550 : 420);
    };
    if (S.mode === 'manual') {
      // 手动：幕间转场不自动播放，点“继续”/点画面才进入下一幕
      el.nextBtn.classList.remove('hidden');
      el.nextBtn.textContent = '▼ 继续';
      bindOnceContinue(function () {
        if (!finished) { clearTimers(); finish(); }
      });
      el.transition.onclick = function () {
        commitAdvance(function () {
          if (!finished) { clearTimers(); finish(); }
        });
      };
    } else {
      el.transition.onclick = null;
      later(finish, 3300);
    }
  }

  // ---------- 最终结局 ----------
  function playFinal() {
    S.phase = 'final';
    clearScene();
    hide(el.ending);
    el.era.textContent = '今日 · 哈尔滨 · 阿城';
    el.factbar.textContent = '史实依据：金上京遗址 · 何延川烈士纪念馆 · 阿什河生态治理';
    var seq = FINAL_SEQ;
    var fi = 0;
    var stepFinal = function () {
      var fr = seq.frames[fi];
      if (!fr) { showCredit(); return; }
      clearScene();
      useBackdrop(seq.mood, seq.palette, fr.img || '');
      el.actTag.textContent = fi === 0 ? '最终结局 · 千年对话' : '';
      setSub(fr.sub || '');
      showSpeaker(fr.speaker || '');
      captionShow(fr.speaker || fr.text ? 'box' : (fr.sub ? 'plain' : ''));
      // 预载下一帧图片，保证结局连续播放顺畅
      if (seq.frames[fi + 1] && seq.frames[fi + 1].img) preloadShot(seq.frames[fi + 1].img);
      var goNext = function () {
        if (S.phase !== 'final') return;
        fi++; stepFinal();
      };
      if (fr.text) {
        typeInto(el.line, fr.text, S.mode === 'auto' ? 20 : 45, function () {
          // 自动演示：打字完成稍候自动推进；手动：停在全文等点击
          if (S.mode === 'auto') later(goNext, 2800);
        });
      } else if (S.mode === 'auto') {
        later(goNext, 3800);   // 无文字帧（纯图/黑场）自动稍候
      }
      if (S.mode === 'manual') {
        // 手动：每帧都不自动推进，点正文/“继续”才走（含无文字帧）
        el.nextBtn.classList.remove('hidden');
        el.nextBtn.textContent = '▼ 继续';
        bindOnceContinue(goNext);
        el.caption.onclick = function () {
          commitAdvance(function () {
            if (S.typing) { finishType(); return; }   // 第一下：补全全文
            goNext();
          });
        };
      }
    };
    stepFinal();
  }

  // 兜底：全部幕播完后收尾（正常情况下由第七幕 C / 片尾接管）
  function afterAllActs() {
    showCredit();
  }

  function showCredit() {
    S.phase = 'credit';
    hide(el.nextBtn);
    markSeen('final:credit');   // 完整看完片尾 → 点亮最终结局收藏
    show(el.credit);
    if (S.mode === 'manual') {
      // 手动模式：点一下即结束片尾、返回主菜单（不自动计时）
      el.credit.onclick = function () {
        commitAdvance(function () {
          if (S.phase !== 'credit') return;
          clearTimers();
          el.credit.classList.remove('show');
          showMenu();
        });
      };
    } else {
      el.credit.onclick = null;
      later(function () {
        // 自动播完片尾 → 回主菜单
        el.credit.classList.remove('show');
        showMenu();
      }, 9000);
    }
  }

  // ============ 第二屏：章节时间轴 / 结局图鉴 ============
  // 图鉴收藏：记录玩家在手动试玩中见证过的结局（localStorage 持久化）
  var GAL_LS = 'qiannian_gallery_v1';
  function loadSeen() {
    try { var s = localStorage.getItem(GAL_LS); return s ? JSON.parse(s) : []; }
    catch (e) { return []; }
  }
  function saveSeen(arr) { try { localStorage.setItem(GAL_LS, JSON.stringify(arr)); } catch (e) {} }
  function markSeen(id) {
    var arr = loadSeen();
    if (arr.indexOf(id) < 0) { arr.push(id); saveSeen(arr); }
  }
  function isSeen(id) { return loadSeen().indexOf(id) >= 0; }

  // 收集全部「结局」条目：错误选项分支 + 第七幕尾声 + 最终结局
  function collectGallery() {
    var items = [];
    ACTS.forEach(function (a) {
      if (!a.choices) return;
      a.choices.forEach(function (ch) {
        if (ch.kind === 'good') return;
        items.push({
          id: a.id + ':' + ch.key,
          act: a.title,
          era: a.era,
          tag: ch.tag,
          kind: ch.kind,
          voice: ch.ending.voice,
          fact: ch.ending.fact,
          mood: ch.ending.mood,
          palette: ch.ending.palette,
          img: ch.ending.img
        });
      });
    });
    // 最终结局 · 千年对话（完整通关后解锁）
    items.push({
      id: 'final:credit',
      act: '最终结局 · 千年对话',
      era: '当代 · 阿什河',
      tag: '家国永续',
      kind: 'credit',
      voice: '八百多年前，完颜阿骨打在按出虎水畔筑城奋起，拒外侮、守故土；烽火年代，何延川从这片河畔挺身而出，抛头颅、护家国。古人筑城立根，先烈浴血守国，我们薪火相传。这就是阿什河的故事，这就是中国的故事。',
      fact: '哈尔滨市阿城区 · 金源文化 · 东北抗联文化（完整走完史实主线后解锁）',
      mood: FINAL_SEQ.mood,
      palette: FINAL_SEQ.palette,
      img: 'assets/final_5.png'
    });
    return items;
  }

  // 渲染章节时间轴：从任意一幕开始（手动 / 自动）
  function renderTimeline() {
    el.paneTimeline.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'tlWrap';
    var hint = document.createElement('div');
    hint.className = 'tlHint';
    hint.textContent = '沿这条河走一千年：任选一幕开始。手动 = 你来选择；自动 = 沿史实路径自动推进。';
    wrap.appendChild(hint);
    ACTS.forEach(function (a, idx) {
      var it = document.createElement('div');
      it.className = 'tlItem';
      var btnBox = document.createElement('div');
      btnBox.className = 'tlStart';
      var bManual = document.createElement('button');
      bManual.className = 'midBtn'; bManual.textContent = '▶ 从此幕手动';
      bManual.addEventListener('click', function () { commitAdvance(function () { startGame('manual', idx); }); });
      var bAuto = document.createElement('button');
      bAuto.className = 'midBtn'; bAuto.textContent = '◆ 从此幕自动';
      bAuto.addEventListener('click', function () { commitAdvance(function () { startGame('auto', idx); }); });
      btnBox.appendChild(bManual); btnBox.appendChild(bAuto);
      it.innerHTML = '<div class="tlDot"></div>' +
        '<div class="tlEra">' + a.era + '</div>' +
        '<div class="tlInfo"><div class="tlTitle">' + a.title + '</div>' +
        '<div class="tlSub">' + (a.subtitle || (a.frames && a.frames[0] && a.frames[0].sub) || '') + '</div></div>';
      it.appendChild(btnBox);
      wrap.appendChild(it);
    });
    el.paneTimeline.appendChild(wrap);
  }

  // 渲染结局图鉴
  function renderGallery() {
    var items = collectGallery();
    var seen = loadSeen();
    var pane = el.paneGallery;
    pane.innerHTML = '';
    var top = document.createElement('div');
    top.className = 'galTop';
    top.innerHTML = '<div class="galTopTitle">见证过的历史 · 结局图鉴</div>' +
      '<div class="galTopCount">已见证 ' + seen.length + ' / ' + items.length + '</div>';
    pane.appendChild(top);
    if (seen.length === 0) {
      var e = document.createElement('div');
      e.className = 'galEmpty';
      e.textContent = '你尚未见证任何结局。进入「手动试玩」，在历史的岔路口做出选择——每一条未被选中的路，都会在这里点亮。';
      pane.appendChild(e);
    }
    var grid = document.createElement('div');
    grid.className = 'galGrid';
    items.forEach(function (it) {
      var unlocked = seen.indexOf(it.id) >= 0;
      var card = document.createElement('button');
      card.className = 'galCard' + (unlocked ? '' : ' locked');
      var kindLabel = it.kind === 'bad' ? '另一条路 · ' + it.era
        : (it.kind === 'ending' ? '终章尾声 · ' + it.era
          : (it.kind === 'final' ? '通往最终结局 · ' + it.era : it.era));
      card.innerHTML = '<div class="galEra">' + it.act + '</div>' +
        '<div class="galTag">' + (unlocked ? it.tag : '？？？') + '</div>' +
        '<div class="galAct">' + (unlocked ? kindLabel : '作出选择后点亮') + '</div>';
      if (unlocked) {
        card.addEventListener('click', function () { showEndingReview(it); });
      }
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    refreshGalleryBadge(items.length, seen.length);
  }

  function refreshGalleryBadge(total, seenCount) {
    if (el.btnGallery) {
      el.btnGallery.textContent = '❖ 结局图鉴' + (total ? ' · ' + seenCount + '/' + total : '');
    }
  }

  // 渲染人物志：阿什河畔的史实人物（当前收录何延川）
  function renderFigures(selId) {
    el.paneFigures.innerHTML = '';
    if (typeof FIGURES === 'undefined' || !FIGURES.length) {
      el.paneFigures.innerHTML = '<div class="galEmpty">人物志整理中，敬请期待。</div>';
      return;
    }
    var cur = null;
    for (var i = 0; i < FIGURES.length; i++) {
      if (FIGURES[i].id === selId) cur = FIGURES[i];
    }
    if (!cur) cur = FIGURES[0];
    // 人物切换胶囊（供后续扩充人物）
    var pills = document.createElement('div');
    pills.className = 'figPills';
    FIGURES.forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'figPill' + (f.id === cur.id ? ' on' : '');
      b.textContent = f.name;
      b.addEventListener('click', function () { renderFigures(f.id); });
      pills.appendChild(b);
    });
    el.paneFigures.appendChild(pills);

    var box = document.createElement('div');
    box.className = 'figBox';
    var hero = document.createElement('div');
    hero.className = 'figHero';
    hero.innerHTML = '<div class="figName">' + cur.name + '</div>' +
      '<div class="figMeta">' + cur.years + ' · ' + cur.alias +
      '<br>' + cur.origin + '<br>' + cur.role + '</div>';
    box.appendChild(hero);
    if (cur.intro) {
      var intro = document.createElement('div');
      intro.className = 'figIntro';
      intro.textContent = cur.intro;
      box.appendChild(intro);
    }
    var tl = document.createElement('div');
    tl.className = 'figTimeline';
    cur.nodes.forEach(function (n) {
      var row = document.createElement('div');
      row.className = 'figNode';
      row.innerHTML = '<div class="figYear">' + n.y + '</div>' +
        '<div class="figBody"><div class="figT">' + n.t + '</div>' +
        '<div class="figD">' + n.d + '</div></div>';
      tl.appendChild(row);
    });
    box.appendChild(tl);
    if (cur.legacy) {
      var leg = document.createElement('div');
      leg.className = 'figLegacy';
      leg.textContent = cur.legacy;
      box.appendChild(leg);
    }
    var ft = document.createElement('div');
    ft.className = 'figFact';
    ft.textContent = cur.fact || '';
    box.appendChild(ft);
    el.paneFigures.appendChild(box);
  }

  // 面板 Tab 切换
  var panelTabs = null;
  function bindPanelTabs() {
    if (!el.panel) return;
    el.panelTabs = el.panel.querySelectorAll('.ptab');
    el.panelTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchPane(t.getAttribute('data-tab'));
      });
    });
  }
  function switchPane(name) {
    if (el.panelTabs) el.panelTabs.forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-tab') === name);
    });
    el.paneTimeline.classList.toggle('on', name === 'timeline');
    el.paneGallery.classList.toggle('on', name === 'gallery');
    el.paneFigures.classList.toggle('on', name === 'figures');
  }

  function openPanel(tab) {
    S.phase = 'panel';
    renderTimeline();
    renderGallery();
    renderFigures();
    switchPane(tab || 'timeline');
    hide(el.menu);
    show(el.panel);
  }
  function closePanel() {
    hide(el.panel);
    hide(el.view);
    show(el.menu);
  }

  // 图鉴回看：全屏展示该结局画面与旁白
  function showEndingReview(it) {
    S.phase = 'panel';
    clearTimers(); stopType(); clearScene();
    hide(el.nextBtn);
    hide(el.panel);   // 露出场景底层，好让结局背景图全屏呈现
    useBackdrop(it.mood, it.palette, it.img);
    el.viewTag.textContent = it.act;
    el.viewTitle.textContent = it.tag;
    el.viewVoice.textContent = it.voice;
    el.viewFact.textContent = '史实依据：' + it.fact;
    el.viewHint.textContent = '点击任意处返回图鉴';
    show(el.view);
    el.view.onclick = closeEndingView;
  }
  function closeEndingView() {
    hide(el.view);
    if (S.phase === 'panel') {
      renderGallery();
      useBackdrop('mist', { sky: '#1b2229', sky2: '#10151b', deep: '#06090c' }, '');
      show(el.panel);
    }
  }

  // ---------- 播放中菜单（手动 / 自动通用暂停层） ----------
  // 打开即冻结全部推进计时与逐字（freezeEngine）；「继续」按剩余时间无缝恢复。
  // 主菜单 / 第二屏界面阶段不呼出。
  var PAUSE_NO = { menu: 1, panel: 1 };
  function openPause() {
    if (PAUSE_NO[S.phase]) return;
    if (el.pause.classList.contains('show')) { setOpenPz(''); return; }
    freezeEngine();
    renderPauseMeta();
    setOpenPz('');
    show(el.pause);
  }
  function resumePause() {
    if (!el.pause.classList.contains('show')) return;
    hide(el.pause);
    thawEngine();
  }
  function renderPauseMeta() {
    var a = act();
    var total = ACTS.length;
    el.pauseTitle.textContent = a.title;
    el.pauseMeta.textContent = (S.mode === 'auto' ? '◆ 自动演示' : '▶ 手动试玩');
    var seg = '';
    if (S.phase === 'question') seg = '抉择中 · 通往 ' + (a.choices ? a.choices.length : 0) + ' 个方向';
    else if (S.phase === 'titlecard') seg = '本幕标题卡';
    else if (S.phase === 'intro') seg = '片头独白';
    else if (S.phase === 'goodpreview') seg = '结局预览';
    else if (S.phase === 'ending') seg = '结局回望';
    else if (S.phase === 'transition') seg = '幕间转场';
    else if (S.phase === 'final') seg = '最终结局 · 千年对话';
    else if (S.phase === 'credit') seg = '片尾';
    else if (a.frames && a.frames.length)
      seg = '第 ' + Math.min(S.fIdx + 1, a.frames.length) + ' / ' + a.frames.length + ' 句';
    el.pauseProg.textContent = '第 ' + (S.actIdx + 1) + ' / ' + total + ' 幕 · ' + seg;
  }

  // 子面板：跳幕 / 回看 / 偏好（一次只展开一张）
  var PZ_MAP = { acts: 'pzActs', recall: 'pzRecall', prefs: 'pzPrefs' };
  var PZ_BTN = { acts: 'btnPauseActs', recall: 'btnRecall', prefs: 'btnPrefs' };
  var openPz = '';
  function setOpenPz(name) {
    openPz = name || '';
    Object.keys(PZ_MAP).forEach(function (k) {
      var is = (k === openPz);
      el[PZ_MAP[k]].classList.toggle('on', is);
      el[PZ_BTN[k]].classList.toggle('on', is);
    });
    if (openPz === 'acts') renderActJump();
    else if (openPz === 'recall') renderRecallList();
    else if (openPz === 'prefs') renderPrefsUI();
  }
  function togglePz(name) {
    if (!el.pause.classList.contains('show')) return;
    setOpenPz(openPz === name ? '' : name);
  }

  // 跳幕：迷你时间轴，从任意一幕开头重播（沿用当前模式）
  function renderActJump() {
    el.pzActList.innerHTML = '';
    ACTS.forEach(function (a, idx) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'pzAct' + (idx === S.actIdx ? ' cur' : '');
      var t = document.createElement('span'); t.className = 'paTitle'; t.textContent = a.title;
      var e = document.createElement('span'); e.className = 'paEra'; e.textContent = a.era;
      row.appendChild(t); row.appendChild(e);
      row.addEventListener('click', function () {
        commitAdvance(function () { startGame(S.mode, idx); });
      });
      el.pzActList.appendChild(row);
    });
  }

  // 回看：本幕已播台词记录
  function renderRecallList() {
    el.pzRecallList.innerHTML = '';
    if (!RECALL.length) {
      var e0 = document.createElement('div');
      e0.className = 'pzEmpty';
      e0.textContent = '本幕还没有播放到台词，先去往前推进吧。';
      el.pzRecallList.appendChild(e0);
      return;
    }
    RECALL.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'rcRow';
      var w = document.createElement('div'); w.className = 'rcWho'; w.textContent = r.who;
      var x = document.createElement('div'); x.className = 'rcText'; x.textContent = r.text;
      row.appendChild(w); row.appendChild(x);
      el.pzRecallList.appendChild(row);
    });
  }

  // 播放偏好设置界面（即时生效 + 自动保存）
  function renderPrefsUI() {
    el.pzPrefsBox.innerHTML = '';
    var pfRow = function (name, desc, opts, cur, onPick) {
      var r = document.createElement('div'); r.className = 'pfRow';
      var l = document.createElement('div'); l.className = 'pfLabel';
      var n = document.createElement('div'); n.className = 'pfName'; n.textContent = name;
      var d = document.createElement('div'); d.className = 'pfDesc'; d.textContent = desc || '';
      l.appendChild(n); l.appendChild(d);
      var g = document.createElement('div'); g.className = 'pfSeg';
      opts.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pfOpt' + (o[0] === cur ? ' on' : '');
        b.textContent = o[1];
        b.addEventListener('click', function () {
          onPick(o[0]);
          Array.prototype.forEach.call(g.children, function (c) { c.classList.toggle('on', c === b); });
        });
        g.appendChild(b);
      });
      r.appendChild(l); r.appendChild(g);
      el.pzPrefsBox.appendChild(r);
    };
    pfRow('字幕', '是否显示每句的画面说明小字', [['1', '显示'], ['0', '隐藏']],
      prefs.sub ? '1' : '0', function (v) { setPref('sub', v === '1'); });
    pfRow('逐字速度', '影响旁白与对白的打字快慢（立即作用于下文）', [['slow', '慢'], ['normal', '标准'], ['fast', '快']],
      prefs.type, function (v) { setPref('type', v); });
    pfRow('自动节奏', '仅自动演示生效：句与句之间的停顿长短', [['slow', '舒缓'], ['normal', '标准'], ['fast', '紧凑']],
      prefs.auto, function (v) { setPref('auto', v); });
  }

  // ---------- 主菜单 / 重启 ----------
  function showMenu() {
    S.phase = 'menu';
    clearTimers(); stopType(); clearScene();
    hide(el.nextBtn);
    // 瞬时清掉全部遮罩：菜单淡入的半透明窗口里，不允许任何旧字幕/旧结局
    // 文字还在淡出透出来（用户 Esc 退出时尤其明显）
    hide(el.transition);
    hide(el.ending);
    hide(el.credit);
    hide(el.panel);
    hide(el.view);
    hide(el.pause);
    el.actTag.textContent = '';
    el.era.textContent = '— · —';
    el.factbar.textContent = '';
    el.modeTag.textContent = '';
    // 主菜单徽标：已见证结局 n/总数
    var galAll = collectGallery();
    refreshGalleryBadge(galAll.length, loadSeen().length);
    useBackdrop('mist', { sky: '#1b2229', sky2: '#10151b', deep: '#06090c' }, '');
    show(el.menu);
  }

  // ---------- 继续按钮一次性绑定 ----------
  var contHandler = null;
  function bindOnceContinue(fn) {
    if (contHandler) el.nextBtn.removeEventListener('click', contHandler);
    contHandler = function () {
      commitAdvance(function () {
        if (S.typing) { finishType(); return; }
        fn();
      });
    };
    el.nextBtn.addEventListener('click', contHandler);
  }

  // ---------- 键盘 ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (S.phase === 'panel' && el.view.classList.contains('show')) {
        closeEndingView();
        return;
      }
      if (S.phase === 'panel') { closePanel(); return; }
      // 暂停菜单开着 → 继续回现场；否则呼出（手动 / 自动均支持真暂停）
      if (el.pause.classList.contains('show')) { resumePause(); return; }
      openPause();
      return;
    }
    if (S.phase !== 'question' || S.mode !== 'manual') return;
    if (el.pause.classList.contains('show')) return;   // 暂停菜单打开时禁用选项热键
    var k = e.key.toUpperCase();
    var a = act();
    if (!a.choices) return;
    var ch = a.choices.filter(function (c) { return c.key === k; })[0];
    if (ch) commitAdvance(function () { onChoose(a, ch); });
  });

  // ---------- 启动 ----------
  el.btnManual.addEventListener('click', function () { commitAdvance(function () { startGame('manual'); }); });
  el.btnAuto.addEventListener('click', function () { commitAdvance(function () { startGame('auto'); }); });
  el.btnTimeline.addEventListener('click', function () { commitAdvance(function () { openPanel('timeline'); }); });
  el.btnGallery.addEventListener('click', function () { commitAdvance(function () { openPanel('gallery'); }); });
  el.btnFigures.addEventListener('click', function () { commitAdvance(function () { openPanel('figures'); }); });
  el.panelBack.addEventListener('click', function () { commitAdvance(function () { closePanel(); }); });
  el.restartBtn.addEventListener('click', function () { openPause(); });
  // 播放中菜单
  el.btnResume.addEventListener('click', function () { commitAdvance(resumePause); });
  el.btnPauseRestart.addEventListener('click', function () {
    commitAdvance(function () { startGame(S.mode, S.actIdx); });
  });
  el.btnPauseTimeline.addEventListener('click', function () {
    commitAdvance(function () { showMenu(); openPanel('timeline'); });
  });
  el.btnPauseGallery.addEventListener('click', function () {
    commitAdvance(function () { showMenu(); openPanel('gallery'); });
  });
  el.btnPauseMenu.addEventListener('click', function () { commitAdvance(showMenu); });
  // 暂停菜单子面板：跳幕 / 台词回看 / 播放偏好
  el.btnPauseActs.addEventListener('click', function () { togglePz('acts'); });
  el.btnRecall.addEventListener('click', function () { togglePz('recall'); });
  el.btnPrefs.addEventListener('click', function () { togglePz('prefs'); });
  bindPanelTabs();

  // 初始背景
  showMenu();
})();
