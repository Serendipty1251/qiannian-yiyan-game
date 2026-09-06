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

  // 图片层（用于替换程序化背景）
  var bgImg = document.createElement('div');
  bgImg.id = 'bgImg';
  el.bg.appendChild(bgImg);

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

  function useBackdrop(mood, pal, imgPath) {
    if (imgPath) {
      bgImg.style.backgroundImage = 'url("' + imgPath + '")';
      bgImg.classList.add('on');
      el.bgGrad.style.opacity = '0';
    } else {
      bgImg.style.backgroundImage = '';
      bgImg.classList.remove('on');
      el.bgGrad.style.opacity = '1';
    }
    setMood(mood, pal);
    spawnParticles(mood);
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
  function typeInto(node, text, cps, done) {
    clearTimers(); stopType();
    node.textContent = '';
    if (!text) { if (done) done(); return; }
    S.typing = true;
    var i = 0;
    var speed = 1000 / cps;
    function step() {
      if (!S.typing) { if (done) done(); return; }
      i++;
      node.textContent = text.slice(0, i);
      if (i < text.length) {
        S.timers.push(setTimeout(step, speed));
      } else {
        S.typing = false;
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
    el.transition.classList.remove('show');
    el.ending.classList.remove('show');
    el.credit.classList.remove('show');
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
    // 幕标题卡（黑幕白字）
    S.phase = 'titlecard';
    useBackdrop(a.mood, a.palette, '');
    el.actTag.textContent = a.title;
    showTitleCard(a.subtitle || a.title, a.era, function () {
      if (a.id === 'act0') { playAct0(); return; }
      // 统一独白
      S.phase = 'intro';
      showSpeaker('');
      el.actTag.textContent = a.title;
      el.sub.textContent = '';
      var cps = S.mode === 'auto' ? 15 : 26;
      typeInto(el.line, INTRO_LINE, cps, function () {
        afterIntro(a);
      });
      if (S.mode === 'manual') {
        el.nextBtn.classList.remove('hidden');
        el.nextBtn.textContent = '▼ 继续';
        bindOnceContinue(function () {
          if (S.typing) { finishType(); } else { afterIntro(a); }
        });
      }
    });
  }

  function finishType() { stopType(); el.line.textContent = ''; }

  function showTitleCard(text, era, done) {
    el.transitionText.textContent = text + (era ? '\n' + era : '');
    show(el.transition);
    var wait = S.mode === 'auto' ? 2400 : 1900;
    later(function () {
      el.transition.classList.remove('show');
      later(done, 500);
    }, wait);
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

    var after = function () {
      if (S.mode === 'manual') {
        // 最后一帧手动 → 显示继续；点击进下帧或提问
        if (i < a.frames.length - 1 || a.autoNext || !a.choices) {
          el.nextBtn.classList.remove('hidden');
          bindOnceContinue(function () {
            if (S.typing) { finishType(); return; }
            if (i < a.frames.length - 1) playFrame(i + 1);
            else afterFrames(a);
          });
        } else {
          // 剧情帧播完 → 自动弹选项
          later(function () { afterFrames(a); }, 900);
        }
      } else {
        // 自动
        var pause = fr.kind === 'titlecard' ? 1600 : (i < a.frames.length - 1 ? 1400 : 1500);
        later(function () {
          if (i < a.frames.length - 1) playFrame(i + 1);
          else afterFrames(a);
        }, pause);
      }
    };

    if (fr.kind === 'titlecard') {
      // 大字标题帧：纯黑底、不做逐字
      useBackdrop('black', { sky: '#000000', sky2: '#0b0b0d', deep: '#000000' }, '');
      el.speaker.classList.remove('show');
      el.line.textContent = fr.text;
      el.line.style.fontSize = 'clamp(26px, 6vh, 56px)';
      el.line.style.letterSpacing = '10px';
      el.line.style.color = '#f5efe0';
      later(after, S.mode === 'auto' ? 2200 : 1600);
      if (S.mode === 'manual') {
        el.nextBtn.classList.remove('hidden');
        bindOnceContinue(after);
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
      var cps = S.mode === 'auto' ? 30 : 60;
      typeInto(el.line, fr.text, cps, after);
    } else {
      later(after, S.mode === 'auto' ? 1200 : 900);
    }
    if (S.mode === 'manual' && fr.text) {
      el.line.onclick = function () {
        if (S.typing) {
          stopType();
          el.line.textContent = fr.text;
          later(function () {
            if (i < a.frames.length - 1) {
              el.nextBtn.classList.remove('hidden');
              bindOnceContinue(function () { playFrame(i + 1); });
            } else {
              later(function () { afterFrames(a); }, 600);
            }
          }, 200);
        }
      };
    }
  }

  function afterFrames(a) {
    hide(el.nextBtn);
    if (a.autoNext || !a.choices) {
      // 序章 → 转场进第一幕
      S.phase = 'transition';
      showTransition(a.transition, function () {
        if (a.id === 'act0') enterAct(1);
        else afterAllActs();
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
    el.line.style.fontSize = '';
    el.choices.innerHTML = '';
    a.choices.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.className = 'choice';
      var tagCls = ch.kind === 'good' || ch.kind === 'final' ? 'good' : 'bad';
      var tagTxt = ch.kind === 'final' ? '终章 · 千年一眼 → 最终结局'
                 : (ch.kind === 'ending' ? '终章 · ' + ch.tag : (ch.kind === 'good' ? '进入下一幕' : '结局 · ' + ch.tag));
      b.innerHTML = '<span class="tag ' + tagCls + '">' + tagTxt + '</span><span class="label">' + ch.label + '</span><span class="key">' + ch.key + '</span>';
      b.addEventListener('click', function () { onChoose(a, ch); });
      el.choices.appendChild(b);
      setTimeout(function () { b.classList.add('on'); }, 120 + i * 130);
    });
    if (S.mode === 'auto') {
      // 自动选择正确项
      var good = a.choices.filter(function (c) { return c.kind === 'good' || c.kind === 'final'; })[0];
      later(function () { onChoose(a, good); }, 2600);
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
    typeInto(el.endingVoice, ch.ending.voice, S.mode === 'auto' ? 20 : 45, function () {
      later(function () {
        el.ending.classList.remove('show');
        if (isFinal) { playFinal(); return; }
        // 转场到下一幕
        S.phase = 'transition';
        showTransition(a.transition, function () {
          if (a.id === 'act7') { afterAllActs(); return; }
          enterAct(S.actIdx + 1);
        });
      }, S.mode === 'auto' ? 1500 : 2200);
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
    var back = (ch.kind === 'ending') ? '这是平行历史的一瞥 · 你仍可重选，走向最终结局' : '3 秒后回到本幕，重新选择';
    el.endingCount.textContent = back;
    typeInto(el.endingVoice, ch.ending.voice, S.mode === 'auto' ? 20 : 45, function () {
      var n = 3;
      var closeBack = function () {
        // 回到本幕重选（剧情帧重播到问题处）
        el.ending.classList.remove('show');
        el.ending.onclick = null;
        enterAct(S.actIdx);
      };
      var tick = function () {
        if (ch.kind === 'ending') {
          // 终幕 A/B：多停留片刻供阅读，再返回可重选
          el.endingCount.textContent = '再选一次，去看看另一个答案 →';
          later(closeBack, S.mode === 'auto' ? 3000 : 2600);
          return;
        }
        if (n > 0) {
          el.endingCount.textContent = n + ' 秒后回到本幕重选…';
          n--;
          later(tick, 1000);
          return;
        }
        closeBack();
      };
      later(tick, S.mode === 'auto' ? 500 : 800);
    });
    // 手动模式允许点击结束等待
    if (S.mode === 'manual') {
      el.ending.onclick = function () {
        if (S.phase !== 'ending') return;
        clearTimers(); stopType();
        el.ending.classList.remove('show');
        el.ending.onclick = null;
        enterAct(S.actIdx);
      };
    }
  }

  // ---------- 转场 ----------
  function showTransition(text, done) {
    hide(el.nextBtn);
    el.transitionText.textContent = text;
    show(el.transition);
    later(function () {
      el.transition.classList.remove('show');
      later(done, 550);
    }, S.mode === 'auto' ? 2500 : 2100);
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
      el.sub.textContent = fr.sub || '';
      showSpeaker(fr.speaker || '');
      if (fr.text) {
        typeInto(el.line, fr.text, S.mode === 'auto' ? 24 : 45, function () {
          later(function () { fi++; stepFinal(); }, S.mode === 'auto' ? 2200 : 2600);
        });
      } else {
        later(function () { fi++; stepFinal(); }, 3000);
      }
      if (S.mode === 'manual' && fr.text) {
        el.line.onclick = function () {
          if (S.typing) { stopType(); el.line.textContent = fr.text; }
          else { fi++; stepFinal(); }
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
    later(function () {
      // 播放完片尾 → 回主菜单
      el.credit.classList.remove('show');
      showMenu();
    }, S.mode === 'auto' ? 8000 : 4000);
  }

  // ---------- 主菜单 / 重启 ----------
  function showMenu() {
    S.phase = 'menu';
    clearTimers(); stopType(); clearScene();
    hide(el.nextBtn);
    el.transition.classList.remove('show');
    el.ending.classList.remove('show');
    el.credit.classList.remove('show');
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
    contHandler = function () { if (S.typing) { finishType(); return; } fn(); };
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
    if (ch) onChoose(a, ch);
  });

  // ---------- 启动 ----------
  el.btnManual.addEventListener('click', function () { startGame('manual'); });
  el.btnAuto.addEventListener('click', function () { startGame('auto'); });
  el.restartBtn.addEventListener('click', function () { showMenu(); });

  // 初始背景
  showMenu();
})();
