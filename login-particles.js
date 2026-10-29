/* ---- Canvas particle network (trang đăng nhập) ---- */
(function () {
  'use strict';
  var cv = document.getElementById('particle-canvas');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var w, h;
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var COUNT = window.innerWidth < 768 ? 40 : 75;
  var MAX_DIST = 140;
  var particles = [];

  function resize() { w = cv.width = window.innerWidth; h = cv.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  for (var i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 1.8 + 0.5,
      alpha: Math.random() * 0.55 + 0.25
    });
  }

  function renderFrame() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180, 210, 255, ' + p.alpha + ')';
      ctx.fill();
    }
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x;
        var dy = particles[i].y - particles[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(100, 180, 255, ' + ((1 - dist / MAX_DIST) * 0.28) + ')';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  }

  function loop() {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    renderFrame();
    requestAnimationFrame(loop);
  }

  if (reduceMotion) renderFrame();
  else loop();
})();
