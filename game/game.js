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
    line: $('line'), sub: $('sub'),
    era: $('era'), modeTag: $('modeTag'), factbar: $('factbar'), plaque: $('plaque'),
    nextBtn: $('nextBtn'), choices: $('choices'),
    menu: $('menuOverlay'), transition: $('transitionOverlay'), transitionText: $('transitionText'),
    ending: $('endingOverlay'), endingTag: $('endingTag'), endingTitle: $('endingTitle'),
    endingVoice: $('endingVoice'), endingCount: $('endingCount'),
    credit: $('creditOverlay'),
    btnManual: $('btnManual'), btnAuto: $('btnAuto'), restartBtn: $('restartBtn')
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
    timers: [],
    particles: []
  };

  // ---------- 工具 ----------
  function later(fn, ms) {
    var t = setTimeout(fn, ms);
    S.timers.push(t);
    return t;
  }
  function clearTimers() {
    S.timers.forEach(function (t) { clearTimeout(t); });
    S.timers = [];
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
    var speed = 1000 / cps;
    function step() {
      if (!S.typing) { lastType = null; if (done) done(); return; }
      i++;
      node.textContent = text.slice(0, i);
      if (i < text.length) {
        S.timers.push(setTimeout(step, speed));
      } else {
        S.typing = false;
        lastType = null;
        if (done) done();
      }
    }
    S.timers.push(setTimeout(step, 60));
  }

  // ---------- 文本可见性 ----------
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
    hide(el.nextBtn);
    el.choices.innerHTML = '';
  }

  function showSpeaker(name) {
    if (name) { el.speaker.textContent = name; el.speaker.classList.add('show'); }
    else el.speaker.classList.remove('show');
  }

  // ================= 主流程 =================
  function startGame(mode) {
    S.mode = mode;
    S.actIdx = 0;
    el.modeTag.textContent = mode === 'auto' ? '◆ 自动演示' : '▶ 手动试玩';
    hide(el.menu);
    clearTimers(); stopType(); clearScene();
    hide(el.transition);
    hide(el.ending);
    hide(el.credit);
    enterAct(0);
  }

  function act() { return ACTS[S.actIdx]; }

  function enterAct(idx) {
    S.actIdx = idx;
    S.fIdx = 0;
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
        // 点正文同样：第一下补全全文，第二下进入正片
        el.line.onclick = function () {
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
      // 点击正文 = 一次点击、一个明确变化：
      //   打字中第 1 下 → 本句立即完整显示；再第 2 下 → 进入下一帧
      el.line.onclick = function () {
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
    if (a.qPrompt) popFade(el.line);
    el.line.style.fontSize = '';
    el.choices.innerHTML = '';
    a.choices.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.className = 'choice';
      var tagCls = ch.kind === 'good' || ch.kind === 'final' ? 'good' : 'bad';
      var tagTxt = ch.kind === 'final' ? '终章 · 千年一眼 → 最终结局'
                 : (ch.kind === 'ending' ? '终章 · ' + ch.tag : (ch.kind === 'good' ? '进入下一幕' : '结局 · ' + ch.tag));
      b.innerHTML = '<span class="tag ' + tagCls + '">' + tagTxt + '</span><span class="label">' + ch.label + '</span><span class="key">' + ch.key + '</span>';
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
        el.line.onclick = function () {
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
    el.actTag.textContent = '';
    el.era.textContent = '— · —';
    el.factbar.textContent = '';
    el.modeTag.textContent = '';
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
    if (e.key === 'Escape') { showMenu(); return; }
    if (S.phase !== 'question' || S.mode !== 'manual') return;
    var k = e.key.toUpperCase();
    var a = act();
    if (!a.choices) return;
    var ch = a.choices.filter(function (c) { return c.key === k; })[0];
    if (ch) commitAdvance(function () { onChoose(a, ch); });
  });

  // ---------- 启动 ----------
  el.btnManual.addEventListener('click', function () { commitAdvance(function () { startGame('manual'); }); });
  el.btnAuto.addEventListener('click', function () { commitAdvance(function () { startGame('auto'); }); });
  el.restartBtn.addEventListener('click', function () { showMenu(); });

  // 初始背景
  showMenu();
})();
