// Homepage: scroll story + "your month in 20 seconds". No trackers, no network.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var story = document.getElementById('story');
  if (story) {
    var stage = story.querySelector('.stage');
    var steps = [].slice.call(story.querySelectorAll('.step'));
    var shots = [].slice.call(story.querySelectorAll('.screen img'));
    var meter = story.querySelector('.meter b');
    var ring = story.querySelector('.meter circle.v');
    var levels = [14, 38, 71, 88, 96];
    var cur = -1, shown = 0;
    document.documentElement.classList.add('js');
    function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function frame() {
      var r = story.getBoundingClientRect(), vh = window.innerHeight;
      var p = clamp((vh * 0.5 - r.top) / (r.height - vh * 0.5));
      var t = reduce ? 1 : clamp((p - 0.06) / 0.16);
      stage.style.setProperty('--t', t.toFixed(3));
      var mid = vh * 0.55, k = 0;
      steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < mid) k = i; });
      if (k !== cur) {
        cur = k;
        steps.forEach(function (s, i) { s.classList.toggle('on', i === k); });
        shots.forEach(function (im, i) { im.classList.toggle('on', i === k); });
        stage.setAttribute('data-step', k);
      }
      var target = levels[k];
      shown += (target - shown) * (reduce ? 1 : 0.18);
      if (Math.abs(target - shown) < 0.4) shown = target;
      meter.textContent = Math.round(shown) + '%';
      ring.style.strokeDashoffset = (100 - shown).toFixed(1);
      if (shown !== target) requestAnimationFrame(frame);
    }
    var ticking = false;
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; frame(); }); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    frame();
  }

  var calc = document.getElementById('month');
  if (calc) {
    var ins = [].slice.call(calc.querySelectorAll('input[type=range]'));
    var fmt = function (n) { return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-CA'); };
    function upd() {
      var v = {}, spent = 0;
      ins.forEach(function (i) {
        v[i.name] = +i.value;
        calc.querySelector('output[for=' + i.id + ']').textContent = fmt(+i.value);
        if (i.name !== 'pay') spent += +i.value;
      });
      var left = v.pay - spent;
      calc.querySelector('.left').textContent = fmt(left);
      calc.querySelector('.perday').textContent = fmt(left / 30.4) + ' a day';
      calc.querySelector('.verdict').textContent = left < 0 ? 'You would be short this month. Something has to give.'
        : left < v.pay * 0.05 ? 'Tight. One surprise bill and you are short.'
        : left < v.pay * 0.15 ? 'Okay. There is room for a small goal.'
        : 'Breathing room. Give that money a job.';
      calc.classList.toggle('neg', left < 0);
      var bar = calc.querySelector('.stack');
      ins.forEach(function (i) {
        if (i.name === 'pay') return;
        var seg = bar.querySelector('[data-k=' + i.name + ']');
        seg.style.flexGrow = Math.max(0, +i.value);
      });
      bar.querySelector('[data-k=left]').style.flexGrow = Math.max(0, left);
    }
    ins.forEach(function (i) { i.addEventListener('input', upd); });
    upd();
  }
})();
