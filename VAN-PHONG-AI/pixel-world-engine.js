(function () {
  'use strict';

  const stage = document.querySelector('.ai-office-stage');
  if (!stage || !window.HTMLCanvasElement) return;

  if (window.PixelWorldEngine && typeof window.PixelWorldEngine.destroy === 'function') {
    window.PixelWorldEngine.destroy();
  }

  const backCanvas = document.createElement('canvas');
  const frontCanvas = document.createElement('canvas');
  backCanvas.className = 'pixel-world-layer';
  frontCanvas.className = 'pixel-world-foreground';
  backCanvas.setAttribute('aria-hidden', 'true');
  frontCanvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(backCanvas);
  stage.appendChild(frontCanvas);

  const back = backCanvas.getContext('2d', { alpha: true });
  const front = frontCanvas.getContext('2d', { alpha: true });
  if (!back || !front) {
    backCanvas.remove();
    frontCanvas.remove();
    return;
  }

  const colors = {
    outline: '#071524', navy: '#102B46', navy2: '#244B6D', blue: '#496F91',
    blue2: '#6387A6', teal: '#3F7D71', teal2: '#62A091', coral: '#A85B4D',
    coral2: '#C47768', gold: '#E7C86D', wood: '#80533F', wood2: '#A86E4E',
    wood3: '#5D3C2E', floor: '#B9A47F', metal: '#536176', metal2: '#AEB8BE',
    paper: '#F0E7C9', screen: '#6DA2B8', green: '#2C7A62', dark: '#172532'
  };

  let width = 0;
  let height = 0;
  let frame = 0;
  let lastPaint = 0;
  let animationTime = 0;
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function snap(value, size) {
    const unit = size || 2;
    return Math.round(value / unit) * unit;
  }

  function box(ctx, fill, x, y, w, h, outline, thickness) {
    const border = thickness || 3;
    const stroke = outline || colors.outline;
    x = snap(x); y = snap(y); w = Math.max(2, snap(w)); h = Math.max(2, snap(h));
    ctx.fillStyle = stroke;
    ctx.fillRect(x - border, y - border, w + border * 2, h + border * 2);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }

  function fill(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(snap(x), snap(y), Math.max(2, snap(w)), Math.max(2, snap(h)));
  }

  function line(ctx, color, x, y, w, h) {
    fill(ctx, color, x, y, w, h);
  }

  function drawRoom(time) {
    const wallHeight = Math.max(38, Math.round(height * .055));
    const leftWall = Math.max(28, Math.round(width * .02));
    fill(back, '#071524', 0, 0, width, height);
    fill(back, '#D8D0BD', leftWall, wallHeight, width - leftWall, height - wallHeight);
    fill(back, '#B9A47F', leftWall, wallHeight + 18, width - leftWall, height - wallHeight - 18);

    const tile = width <= 560 ? 20 : 32;
    const floorTop = wallHeight + 18;
    for (let x = leftWall; x < width; x += tile) {
      fill(back, '#A6926D', x, floorTop, 2, height - floorTop);
      fill(back, '#C4B28C', x + 2, floorTop, 1, height - floorTop);
    }
    for (let y = floorTop; y < height; y += tile) {
      fill(back, '#A6926D', leftWall, y, width - leftWall, 2);
      fill(back, '#C4B28C', leftWall, y + 2, width - leftWall, 1);
    }
    for (let y = floorTop; y < height; y += tile) {
      for (let x = leftWall; x < width; x += tile) {
        if ((((x / tile) * 7 + (y / tile) * 11) % 19) < 1) {
          fill(back, '#9B8968', x + tile * .68, y + tile * .25, 3, 2);
        }
      }
    }

    fill(back, '#0C2238', 0, 0, width, 9);
    fill(back, '#75838E', leftWall, wallHeight, width - leftWall, 8);
    fill(back, '#E7E0CC', leftWall, 9, width - leftWall, wallHeight - 9);
    fill(back, '#0C2238', 0, 0, leftWall, height);
    fill(back, '#75838E', leftWall - 8, wallHeight, 8, height - wallHeight);

  }

  function elementRect(element) {
    if (!element) return null;
    const sr = stage.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height, el: element };
  }

  function all(selector) {
    return Array.from(stage.querySelectorAll(selector)).map(elementRect).filter(Boolean);
  }

  function label(ctx, text, x, y, maxWidth, options) {
    if (!text) return;
    const config = options || {};
    const size = config.size || 10;
    const padding = config.padding || 5;
    const value = String(text).replace(/\s+/g, ' ').trim();
    ctx.save();
    ctx.font = '700 ' + size + 'px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    const measured = Math.min(maxWidth || 999, Math.ceil(ctx.measureText(value).width) + padding * 2);
    const left = snap(x - measured / 2);
    const top = snap(y - (size + padding * 2) / 2);
    box(ctx, config.background || colors.navy, left, top, measured, size + padding * 2,
      config.outline || colors.outline, 2);
    ctx.fillStyle = config.color || colors.gold;
    ctx.textAlign = 'center';
    ctx.fillText(value, snap(x), snap(y + 1), measured - padding * 2);
    ctx.restore();
  }

  function statusColor(element) {
    const status = element.dataset.status;
    if (status === 'done') return colors.green;
    if (status === 'active') return '#316EA5';
    if (status === 'human') return '#B17A24';
    return '#8994A1';
  }

  function drawWorkChair(ctx, x, y, w, h, fillColor, facing) {
    const c = fillColor || colors.blue;
    const edge = '#1D3043';
    let chairW = w;
    let chairH = h;

    ctx.save();
    if (facing === 'up') {
      ctx.translate(x + w, y + h);
      ctx.rotate(Math.PI);
    } else if (facing === 'left') {
      ctx.translate(x + w, y);
      ctx.rotate(Math.PI / 2);
      chairW = h;
      chairH = w;
    } else if (facing === 'right') {
      ctx.translate(x, y + h);
      ctx.rotate(-Math.PI / 2);
      chairW = h;
      chairH = w;
    } else {
      ctx.translate(x, y);
    }

    x = 0;
    y = 0;
    w = chairW;
    h = chairH;
    // Tựa lưng cao nằm sau nhân vật.
    box(ctx, c, x + w * .17, y, w * .66, h * .48, edge, 3);
    fill(ctx, colors.blue2, x + w * .25, y + 5, w * .50, Math.max(4, h * .08));
    line(ctx, edge, x + w * .48, y + h * .45, Math.max(3, w * .08), h * .16);
    // Đệm ngồi, tay vịn và trụ ghế.
    box(ctx, c, x + w * .12, y + h * .48, w * .76, h * .20, edge, 3);
    line(ctx, edge, x, y + h * .42, w * .18, 4);
    line(ctx, edge, x + w * .82, y + h * .42, w * .18, 4);
    line(ctx, colors.metal, x + w * .46, y + h * .67, Math.max(4, w * .10), h * .18);
    // Chân sao có bánh xe.
    line(ctx, colors.metal, x + w * .17, y + h * .84, w * .66, 4);
    line(ctx, colors.metal, x + w * .48, y + h * .79, 4, h * .16);
    fill(ctx, colors.outline, x + w * .10, y + h * .91, 7, 5);
    fill(ctx, colors.outline, x + w * .45, y + h * .93, 7, 5);
    fill(ctx, colors.outline, x + w * .78, y + h * .91, 7, 5);
    ctx.restore();
  }

  function drawScreenContent(ctx, x, y, w, h, variant, status) {
    const mode = variant || 'default';
    const tick = Math.floor(animationTime / 420);
    const blink = tick % 2;
    const activity = status || stage.dataset.workflowState || 'idle';
    const activityColor = activity === 'active' || activity === 'processing' ? '#49C47A' : (activity === 'human' || activity === 'waiting-human' ? '#E7C86D' : (activity === 'done' || activity === 'complete' ? '#8DC2D0' : '#6387A6'));
    fill(ctx, '#10283C', x, y, w, h);

    if (mode === 'intake') {
      fill(ctx, '#2C5874', x, y, w * .27, h);
      fill(ctx, '#8DC2D0', x + 3, y + 4, w * .16, 3);
      fill(ctx, '#E7C86D', x + 3, y + 10, w * .12, 3);
      for (let row = 0; row < 3; row += 1) {
        fill(ctx, row === tick % 3 ? '#DDEBED' : '#769AAF', x + w * .33, y + 3 + row * h * .27, w * .58, Math.max(3, h * .17));
        fill(ctx, '#36566E', x + w * .38, y + 5 + row * h * .27, w * .31, 2);
      }
      if (blink) fill(ctx, '#C94F47', x + w * .84, y + 4, 3, 3);
    } else if (mode === 'review') {
      fill(ctx, '#D9E2DC', x + 3, y + 3, w * .40, h - 6);
      fill(ctx, '#C8D7DF', x + w * .54, y + 3, w * .40, h - 6);
      for (let row = 0; row < 3; row += 1) {
        fill(ctx, '#536176', x + 6, y + 6 + row * 5, w * .27, 2);
        fill(ctx, row === 1 ? '#C47768' : '#536176', x + w * .58, y + 6 + row * 5, w * .27, 2);
      }
      fill(ctx, blink ? '#49C47A' : '#2C7A62', x + w * .46, y + h * .36, 3, 7);
    } else if (mode === 'forms') {
      fill(ctx, '#F0E7C9', x + w * .17, y + 2, w * .66, h - 4);
      fill(ctx, '#496F91', x + w * .23, y + 5, w * .30, 3);
      for (let row = 0; row < 3; row += 1) {
        box(ctx, '#DDE5DF', x + w * .23, y + 10 + row * 5, w * .44, 3, '#8A9BA3', 1);
      }
      fill(ctx, blink ? '#E7C86D' : '#A77F2E', x + w * .70, y + 10 + (tick % 3) * 5, 3, 3);
    } else if (mode === 'approval') {
      const nodeY = y + h * .34;
      for (let node = 0; node < 3; node += 1) {
        box(ctx, node < 2 ? '#62A091' : '#E7C86D', x + 3 + node * w * .32, nodeY, w * .20, h * .30, '#203A4D', 1);
        if (node < 2) line(ctx, '#83BFA5', x + w * (.23 + node * .32), nodeY + h * .12, w * .10, 2);
      }
      line(ctx, '#EAF7F4', x + w * .68, y + h * .49, 3, 3);
      line(ctx, '#EAF7F4', x + w * .71, y + h * .45, 5, 3);
      if (blink) fill(ctx, '#49C47A', x + w * .82, y + 3, 4, 3);
    } else if (mode === 'execution') {
      for (let row = 0; row < 3; row += 1) {
        fill(ctx, '#29475D', x + 4, y + 4 + row * 6, w - 8, 4);
        const progress = Math.min(.85, .28 + row * .17 + ((tick + row) % 4) * .08);
        fill(ctx, row === 1 ? '#E7C86D' : '#62A091', x + 4, y + 4 + row * 6, (w - 8) * progress, 4);
      }
      fill(ctx, '#DDEBED', x + w * .76, y + h - 5, w * .14, 2);
    } else if (mode === 'payment') {
      line(ctx, '#769AAF', x + 4, y + h - 4, w - 8, 2);
      for (let bar = 0; bar < 4; bar += 1) {
        const barH = Math.max(4, h * (.22 + ((bar + tick) % 4) * .10));
        fill(ctx, bar === 3 ? '#E7C86D' : '#62A091', x + 5 + bar * w * .20, y + h - 5 - barH, w * .11, barH);
      }
      fill(ctx, '#DDEBED', x + w * .72, y + 3, w * .17, 3);
      if (blink) fill(ctx, '#49C47A', x + w * .89, y + 3, 3, 3);
    } else if (mode === 'leader') {
      const tiles = ['#316EA5', '#2C7A62', '#B17A24', '#A85B4D'];
      for (let tile = 0; tile < 4; tile += 1) {
        const tx = x + 3 + (tile % 2) * w * .48;
        const ty = y + 3 + Math.floor(tile / 2) * h * .43;
        box(ctx, tiles[tile], tx, ty, w * .39, h * .29, '#29475D', 1);
        fill(ctx, '#EAF7F4', tx + 3, ty + 3, w * (.12 + ((tick + tile) % 3) * .05), 2);
      }
      fill(ctx, blink ? '#49C47A' : '#2C7A62', x + w - 5, y + 2, 3, 3);
    } else if (mode === 'game-platform') {
      fill(ctx, '#6FA9C2', x, y, w, h * .68);
      fill(ctx, '#DCEEF1', x + 4, y + 4, w * .24, 3);
      fill(ctx, '#3F7D71', x, y + h * .68, w, h * .32);
      fill(ctx, '#80533F', x, y + h * .82, w, h * .18);
      const heroX = x + 5 + (tick % Math.max(2, Math.floor((w - 12) / 4))) * 4;
      fill(ctx, '#C94F47', heroX, y + h * .54, 4, 5);
      fill(ctx, '#E7C86D', x + w * .74, y + h * .38, 3, 3);
    } else if (mode === 'game-space') {
      fill(ctx, '#091725', x, y, w, h);
      for (let star = 0; star < 5; star += 1) fill(ctx, star === tick % 5 ? '#E7C86D' : '#8DC2D0', x + 3 + (star * 11) % Math.max(12, w - 5), y + 3 + (star * 7) % Math.max(8, h - 5), 2, 2);
      const shipY = y + 4 + (tick % 3) * 3;
      fill(ctx, '#DDEBED', x + w * .25, shipY, 7, 4);
      fill(ctx, '#C47768', x + w * .20, shipY + 1, 3, 2);
      fill(ctx, '#49C47A', x + w * .72, y + h * .52, 4, 2);
    } else if (mode === 'cctv') {
      for (let camera = 0; camera < 4; camera += 1) {
        const cx = x + (camera % 2) * w * .51;
        const cy = y + Math.floor(camera / 2) * h * .51;
        fill(ctx, camera % 2 ? '#405E6D' : '#365261', cx, cy, w * .47, h * .47);
        fill(ctx, '#8FA6B3', cx + 3, cy + 3, w * .20, 2);
      }
      const scan = (tick % 4) * h * .12;
      fill(ctx, 'rgba(231,200,109,.65)', x, y + scan, w, 2);
      if (blink) fill(ctx, '#C94F47', x + w - 4, y + 2, 3, 3);
    } else {
      fill(ctx, '#416D86', x, y, w * .24, h);
      for (let row = 0; row < 3; row += 1) fill(ctx, '#8DC2D0', x + w * .31, y + 4 + row * 5, w * .55, 2);
      if (blink) fill(ctx, '#EAF7F4', x + w * .57, y + h - 5, w * .09, 3);
    }
    if (mode !== 'game-platform' && mode !== 'game-space') {
      fill(ctx, activityColor, x + 2, y + h - 3, Math.max(4, w * .18), 2);
      if (blink) fill(ctx, '#EAF7F4', x + w - 5, y + h - 3, 3, 2);
    }
  }

  function drawMonitor(ctx, x, y, w, h, variant) {
    box(ctx, '#172B42', x, y, w, h, colors.metal, 3);
    drawScreenContent(ctx, x + 5, y + 5, w - 10, h - 10, variant, stage.dataset.workflowState);
    line(ctx, colors.metal, x + w * .44, y + h + 2, Math.max(4, w * .12), 9);
    line(ctx, colors.metal, x + w * .27, y + h + 9, w * .46, 4);
  }

  function drawDeskMonitor(ctx, x, y, w, h, variant, status) {
    box(ctx, '#172B42', x, y, w, h, '#3D5267', 3);
    drawScreenContent(ctx, x + 5, y + 5, w - 10, h - 10, variant, status);
    line(ctx, '#3D5267', x + w * .46, y + h + 2, Math.max(4, w * .08), 7);
    line(ctx, '#3D5267', x + w * .31, y + h + 8, w * .38, 3);
  }

  function drawStation(rect) {
    const ctx = back;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const accent = window.getComputedStyle(rect.el).getPropertyValue('--desk-accent').trim() || colors.blue;
    drawWorkChair(ctx, x + w * .39, y + h * .52, w * .22, h * .46, accent);

    // Khung bàn thoáng chân, mặt bàn nông để không cắt ngang nhân vật.
    line(ctx, colors.wood3, x + w * .18, y + h * .63, 7, h * .31);
    line(ctx, colors.wood3, x + w * .78, y + h * .63, 7, h * .31);
    box(ctx, '#6D5546', x + w * .72, y + h * .66, w * .13, h * .25, '#49362C', 3);
    line(ctx, '#D3B37B', x + w * .76, y + h * .75, w * .05, 2);
    box(ctx, colors.wood, x + w * .13, y + h * .45, w * .74, h * .18, colors.wood3, 4);
    fill(ctx, colors.wood2, x + w * .17, y + h * .49, w * .66, h * .09);

    drawDeskMonitor(ctx, x + w * .24, y + h * .24, w * .28, h * .18, rect.el.dataset.station || 'default', rect.el.dataset.status);
    box(ctx, '#D4DADD', x + w * .41, y + h * .565, w * .24, 6, colors.metal, 2);
    fill(ctx, '#536176', x + w * .44, y + h * .58, w * .17, 2);
    box(ctx, '#405F7A', x + w * .67, y + h * .39, w * .12, h * .10, '#233A50', 2);
    fill(ctx, colors.paper, x + w * .69, y + h * .36, w * .08, 6);
    box(ctx, colors.gold, x + w * .80, y + h * .48, 9, 12, '#76572E', 2);
  }

  function drawLeader(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    drawWorkChair(back, x + w * .39, y + h * .49, w * .22, h * .48, colors.navy2);
    line(back, colors.wood3, x + 18, y + h * .62, 8, h * .32);
    line(back, colors.wood3, x + w - 26, y + h * .62, 8, h * .32);
    box(back, '#6D5546', x + w - 45, y + h * .64, 29, h * .28, '#49362C', 3);
    box(back, colors.wood, x + 9, y + h * .41, w - 18, h * .18, colors.wood3, 4);
    fill(back, colors.wood2, x + 17, y + h * .45, w - 34, h * .09);

    drawDeskMonitor(back, x + w * .23, y + h * .20, w * .29, h * .19, 'leader', stage.dataset.workflowState);
    box(back, '#D4DADD', x + w * .41, y + h * .525, w * .24, 6, colors.metal, 2);
    fill(back, '#536176', x + w * .44, y + h * .54, w * .18, 2);
    box(back, '#405F7A', x + w * .70, y + h * .34, w * .12, h * .11, '#233A50', 2);
    fill(back, colors.paper, x + w * .72, y + h * .30, w * .08, 7);
    box(back, colors.gold, x + w * .84, y + h * .43, 9, 15, '#76572E', 2);
  }

  function drawMeeting(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    label(back, rect.el.querySelector('strong')?.textContent, x + w / 2, y - 48, w * .76, { size: 10 });
    for (let i = 0; i < 5; i += 1) {
      const chairX = x + 13 + i * ((w - 54) / 4);
      drawWorkChair(back, chairX + 2, y - 34, 30, 32, i % 3 === 2 ? colors.coral : colors.blue, 'down');
      drawWorkChair(back, chairX + 2, y + h + 7, 30, 32, i % 3 === 2 ? colors.coral : colors.teal, 'up');
    }
    box(back, colors.wood, x, y, w, h, colors.wood3, 5);
    fill(back, colors.wood2, x + 10, y + 10, w - 20, h - 20);
    fill(back, '#8E5D45', x + 15, y + 15, w - 30, h - 30);
    box(back, '#D8D0BD', x + w * .42, y + h * .34, w * .16, h * .31, colors.metal, 3);
    fill(back, '#28445D', x + w * .45, y + h * .40, w * .10, h * .13);
    fill(back, colors.paper, x + w * .61, y + h * .37, 23, 13);
    fill(back, '#A8C7D5', x + w * .30, y + h * .50, 23, 13);
  }

  function drawReception(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    label(back, rect.el.querySelector('strong')?.textContent, x + w / 2, y + 12, w - 15, { size: 10 });
    drawWorkChair(back, x + 3, y + h * .40, 32, 38, colors.blue, 'right');
    drawWorkChair(back, x + w - 35, y + h * .40, 32, 38, colors.blue2, 'left');
    drawWorkChair(back, x + 45, y + h * .68, 32, 38, colors.teal, 'up');
    drawWorkChair(back, x + w - 77, y + h * .68, 32, 38, colors.coral, 'up');
    box(back, colors.wood, x + 36, y + h * .30, w - 72, h * .38, colors.wood3, 4);
    fill(back, colors.wood2, x + 44, y + h * .37, w - 88, h * .18);
    box(back, '#D8D0BD', x + w * .44, y + h * .39, w * .12, h * .11, colors.metal, 2);
  }

  function drawDining(rect, index) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    label(back, rect.el.querySelector('strong')?.textContent || ('BAN CA PHE ' + index), x + w / 2, y - 13, w - 10, { size: 9 });
    const tableX = x + w * .23, tableY = y + h * .22, tableW = w * .54, tableH = h * .48;
    drawWorkChair(back, x + w * .36, y - h * .08, w * .28, h * .34, colors.blue, 'down');
    drawWorkChair(back, x + w * .36, y + h * .74, w * .28, h * .34, colors.teal, 'up');
    drawWorkChair(back, x - w * .05, y + h * .34, w * .28, h * .34, colors.coral, 'right');
    drawWorkChair(back, x + w * .77, y + h * .34, w * .28, h * .34, colors.blue, 'left');
    box(back, colors.wood, tableX, tableY, tableW, tableH, colors.wood3, 4);
    fill(back, colors.wood2, tableX + 7, tableY + 7, tableW - 14, tableH - 14);
    fill(back, colors.paper, tableX + tableW * .23, tableY + tableH * .32, tableW * .25, tableH * .25);
    box(back, colors.gold, tableX + tableW * .61, tableY + tableH * .28, 9, 12, '#76572E', 2);
  }

  function drawGame(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    label(back, rect.el.querySelector('strong')?.textContent, x + w / 2, y - 12, w * .65, { size: 10 });
    box(back, colors.wood, x + 8, y + h * .32, w - 16, h * .30, colors.wood3, 4);
    drawMonitor(back, x + w * .20, y + 3, w * .23, h * .30, 'game-platform');
    drawMonitor(back, x + w * .57, y + 3, w * .23, h * .30, 'game-space');
    box(back, '#D4DADD', x + w * .21, y + h * .47, w * .20, 7, colors.metal, 2);
    box(back, '#D4DADD', x + w * .59, y + h * .47, w * .20, 7, colors.metal, 2);
    drawWorkChair(back, x + w * .19, y + h * .62, w * .24, h * .36, colors.coral, 'up');
    drawWorkChair(back, x + w * .57, y + h * .62, w * .24, h * .36, colors.blue, 'up');
    box(back, '#263F55', x + w * .46, y + h * .37, w * .09, h * .24, colors.outline, 2);
    fill(back, colors.green, x + w * .49, y + h * .41, 4, 4);
  }

  function drawServer(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    box(back, '#6D7780', x, y, w, h, '#283847', 6);
    fill(back, '#4A555F', x + 10, y + 10, w - 20, h - 20);
    label(back, rect.el.querySelector('strong')?.textContent, x + w / 2, y + 8, w * .68, { size: 10 });
    for (let rack = 0; rack < 2; rack += 1) {
      const rx = x + 15 + rack * 51;
      box(back, colors.dark, rx, y + 31, 43, h - 53, '#0A141D', 3);
      for (let row = 0; row < 7; row += 1) {
        fill(back, row % 2 ? '#111D27' : '#384958', rx + 6, y + 39 + row * 13, 31, 8);
        const blink = (Math.floor(animationTime / 210) + row + rack) % 3;
        fill(back, blink ? '#49C47A' : '#1F6944', rx + 9, y + 42 + row * 13, 3, 3);
        fill(back, blink === 2 ? colors.gold : '#4D9BC5', rx + 27, y + 42 + row * 13, 3, 3);
      }
    }
    box(back, '#263F55', x + 121, y + 35, w - 142, 20, colors.outline, 3);
    for (let i = 0; i < 7; i += 1) fill(back, i === 3 ? colors.gold : '#49C47A', x + 129 + i * 9, y + 42, 4, 4);
    box(back, '#D3D7D8', x + 121, y + 72, w - 142, 40, colors.metal, 3);
    label(back, 'NAS', x + 142, y + 82, 35, { size: 8, padding: 2, background: '#D3D7D8', color: '#263F55', outline: '#D3D7D8' });
    for (let i = 0; i < 4; i += 1) box(back, '#AEB8BE', x + 130 + i * 14, y + 94, 10, 10, '#384957', 1);
    drawMonitor(back, x + 130, y + 119, 41, 22, 'cctv');
    box(back, '#263847', x + w - 33, y + h - 45, 23, 35, colors.outline, 3);
    fill(back, '#49C47A', x + w - 26, y + h - 35, 4, 4);
  }

  function drawPrintBench(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    function printer(px, py, pw, ph, copier) {
      box(back, copier ? '#C7CDD0' : '#D6D0C2', px, py, pw, ph, colors.metal, 3);
      box(back, '#F0EEE6', px + 5, py - ph * .32, pw - 10, ph * .34, colors.metal, 2);
      fill(back, '#40566B', px + 8, py + 8, pw * .30, 6);
      fill(back, colors.green, px + pw - 9, py + 9, 4, 4);
    }
    printer(x + 10, y + 25, 40, 28, false);
    printer(x + 70, y + 20, 45, 34, false);
    printer(x + 135, y + 13, 58, 41, true);
    const paperStep = Math.floor(animationTime / 360) % 5;
    fill(back, colors.paper, x + 149, y + 45 + paperStep, 29, 7);
    fill(back, '#9FB0B8', x + 152, y + 48 + paperStep, 20, 2);
    box(back, colors.wood, x, y + 47, w, 14, colors.wood3, 3);
    line(back, colors.wood3, x + 15, y + 60, 10, h - 60);
    line(back, colors.wood3, x + w - 25, y + 60, 10, h - 60);
    label(back, rect.el.querySelector('.print-bench-label')?.textContent, x + w / 2, y + h - 4, w * .72, { size: 8, padding: 3 });
  }

  function drawCabinet(rect, type, ctx) {
    const target = ctx && typeof ctx.fillRect === 'function' ? ctx : back;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const body = type === 'knowledge' ? '#35675B' : (type === 'process' ? '#506379' : '#69584F');
    const edge = type === 'knowledge' ? '#24493F' : (type === 'process' ? '#34475D' : '#574940');
    box(target, body, x, y, w, h, edge, 4);
    const rows = type === 'process' ? 4 : 3;
    for (let i = 1; i < rows; i += 1) line(target, edge, x + 3, y + h * i / rows, w - 6, 3);
    for (let i = 0; i < rows; i += 1) {
      if (type === 'file') line(target, '#C9B7A4', x + w * .43, y + h * (i + .48) / rows, w * .16, 3);
      else {
        const palette = ['#E4D8B5', '#9BB1C6', '#C39079', '#92AA86'];
        fill(target, palette[i % palette.length], x + 9, y + h * i / rows + 8, w - 18, Math.max(8, h / rows - 13));
      }
    }
    const selector = type === 'knowledge' ? '.knowledge-cabinet-label' : (type === 'process' ? '.process-cabinet-label' : '.cabinet-label');
    label(target, rect.el.querySelector(selector)?.textContent, x + w / 2, y - 13, Math.max(70, w + 35), { size: 8, padding: 3 });
  }

  function drawNoticeBoard(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    box(back, '#C79D63', x, y, w - 10, h * .70, '#674936', 5);
    fill(back, '#E0BF86', x + 8, y + 8, w - 26, h * .70 - 16);
    const title = rect.el.querySelector('strong')?.textContent || 'BANG CONG VIEC';
    label(back, title, x + (w - 10) / 2, y + 17, w - 34, { size: 9, padding: 3, background: '#F0E7C9', color: '#47372C', outline: '#674936' });
    const pending = document.getElementById('officePendingCount')?.textContent || '0';
    const human = document.getElementById('officeHumanCount')?.textContent || '0';
    box(back, colors.paper, x + 13, y + 35, (w - 43) / 2, 34, '#8E7657', 2);
    box(back, '#E4B2A2', x + 22 + (w - 43) / 2, y + 35, (w - 43) / 2, 34, '#8E7657', 2);
    label(back, pending + ' DANG CHO', x + 13 + (w - 43) / 4, y + 52, (w - 50) / 2, { size: 8, padding: 2, background: colors.paper, color: colors.navy, outline: colors.paper });
    label(back, human + ' CAN BAN', x + 22 + (w - 43) * .75, y + 52, (w - 50) / 2, { size: 8, padding: 2, background: '#E4B2A2', color: colors.navy, outline: '#E4B2A2' });
    const notes = Array.from(rect.el.querySelectorAll('.board-notes small')).slice(0, 3);
    notes.forEach(function (note, index) {
      fill(back, index === 1 ? '#DDE8D8' : colors.paper, x + 14, y + 76 + index * 10, w - 38, 7);
    });
    line(back, '#465666', x + 23, y + h * .72, 5, h * .18);
    line(back, '#465666', x + w - 38, y + h * .72, 5, h * .18);
    line(back, '#465666', x + 23, y + h * .88, w - 56, 5);
    box(back, '#263847', x + 15, y + h * .89, 15, 9, colors.outline, 2);
    box(back, '#263847', x + w - 40, y + h * .89, 15, 9, colors.outline, 2);
  }

  function drawSofa(rect, ctx) {
    const target = ctx && typeof ctx.fillRect === 'function' ? ctx : back;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    label(target, rect.el.querySelector('strong')?.textContent, x + w / 2, y - 17, w + 50, { size: 8, padding: 3 });
    box(target, '#B35443', x, y, w, h, '#873D34', 4);
    box(target, '#8E4137', x - 7, y + 7, 14, h, '#71342E', 2);
    box(target, '#8E4137', x + w - 7, y + 7, 14, h, '#71342E', 2);
    line(target, '#D78472', x + 10, y + h * .45, w - 20, 3);
  }

  function drawPlant(rect, large, ctx) {
    const target = ctx && typeof ctx.fillRect === 'function' ? ctx : back;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const type = (rect.el && rect.el.dataset && rect.el.dataset.plant) || 'fern';
    const potW = large ? w * .58 : w * .65;
    const potColors = { cactus: '#8A6048', flower: '#A85B4D', snake: '#5D4A3A', palm: '#80533F', monstera: '#6B4F3B', fern: '#80533F' };
    const potColor = potColors[type] || '#80533F';

    if (type === 'cactus') {
      box(target, '#5C9666', x + w * .30, y + h * .06, w * .40, h * .58, '#2F5B3A', 2);
      box(target, '#4E8157', x + w * .12, y + h * .36, w * .18, h * .28, '#2F5B3A', 2);
      box(target, '#4E8157', x + w * .68, y + h * .44, w * .16, h * .20, '#2F5B3A', 2);
      line(target, '#2F5B3A', x + w * .34, y + h * .16, 2, 5);
      line(target, '#2F5B3A', x + w * .52, y + h * .20, 2, 5);
      line(target, '#2F5B3A', x + w * .58, y + h * .12, 2, 5);
      box(target, '#E7C86D', x + w * .42, y - 1, w * .16, h * .09, '#76572E', 2);
    } else if (type === 'snake') {
      for (let i = 0; i < 4; i += 1) {
        const lx = x + w * .16 + i * w * .18;
        box(target, i % 2 ? '#3F7D71' : '#2F6659', lx, y + h * .06, w * .15, h * .60, '#1E5948', 2);
        fill(target, '#6FAE96', lx + w * .03, y + h * .10, w * .03, h * .44);
      }
      line(target, '#285E43', x + w * .47, y + h * .34, Math.max(3, w * .08), h * .34);
    } else if (type === 'flower') {
      for (let i = 0; i < 3; i += 1) {
        const lx = x + w * .12 + i * w * .26;
        box(target, '#3F9168', lx, y + h * .26, w * .22, h * .36, '#185640', 2);
      }
      box(target, '#E7C86D', x + w * .30, y + h * .02, w * .40, h * .12, '#B3841F', 2);
      box(target, '#C94F47', x + w * .45, y + h * .04, w * .12, h * .10, '#7A2B27', 2);
      line(target, '#285E43', x + w * .47, y + h * .14, Math.max(3, w * .08), h * .50);
    } else if (type === 'palm') {
      for (let i = 0; i < 5; i += 1) {
        const lx = x + w * .5 + (i - 2) * w * .15;
        const ly = y + h * .06 + Math.abs(i - 2) * h * .12;
        box(target, i % 2 ? '#4D8A66' : '#2C7A62', lx - w * .15, ly, w * .34, h * .22, '#1E5948', 2);
      }
      line(target, '#5D4634', x + w * .45, y + h * .26, Math.max(3, w * .10), h * .42);
    } else if (type === 'monstera') {
      const leaves = large ? 5 : 3;
      for (let i = 0; i < leaves; i += 1) {
        const lx = x + w * .18 + (i % 3) * w * .26;
        const ly = y + h * .06 + Math.floor(i / 3) * h * .24;
        box(target, '#3E8A5F', lx, ly, w * .36, h * .28, '#1F5A3E', 2);
        fill(target, '#7FC09A', lx + w * .10, ly + h * .06, w * .06, h * .14);
      }
      line(target, '#285E43', x + w * .47, y + h * .32, Math.max(3, w * .08), h * .38);
    } else {
      const leaves = large ? 7 : 4;
      for (let i = 0; i < leaves; i += 1) {
        const lx = x + w * .5 + ((i % 3) - 1) * w * .20;
        const ly = y + h * .10 + Math.floor(i / 3) * h * .16;
        const color = i % 2 ? '#3F9168' : '#2C7A62';
        box(target, color, lx - w * .15, ly, w * .30, h * .26, '#185640', 2);
      }
      line(target, '#285E43', x + w * .47, y + h * .33, Math.max(3, w * .08), h * .38);
    }
    box(target, potColor, x + (w - potW) / 2, y + h * .66, potW, h * .30, '#493326', 2);
  }

  function drawBookshelf(rect, ctx) {
    const target = ctx && typeof ctx.fillRect === 'function' ? ctx : back;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    box(target, '#684A38', x, y, w, h, '#3E3029', 4);
    const palette = ['#C85D4C', '#E4B74A', '#3F7EA0', '#7D66A3', '#4D8A66', '#D77A45', '#D9CFB9', '#507DB2'];
    for (let shelf = 0; shelf < 3; shelf += 1) {
      line(target, '#3E3029', x + 5, y + (shelf + 1) * h / 3 - 3, w - 10, 5);
      for (let i = 0; i < 4; i += 1) fill(target, palette[(shelf * 3 + i) % palette.length], x + 8 + i * ((w - 20) / 4), y + shelf * h / 3 + 8, Math.max(6, (w - 27) / 4), h / 3 - 14);
    }
  }

  function drawWater(rect, ctx) {
    const target = ctx && typeof ctx.fillRect === 'function' ? ctx : back;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    box(target, '#D6DDE0', x + w * .14, y + h * .28, w * .72, h * .64, colors.metal, 3);
    box(target, '#8AC6D7', x + w * .25, y, w * .50, h * .35, '#4F8397', 2);
    fill(target, '#C8ECF3', x + w * .31, y + 5, w * .16, h * .21);
    fill(target, colors.blue, x + w * .28, y + h * .52, 7, 5);
    fill(target, colors.coral, x + w * .58, y + h * .52, 7, 5);
    if (Math.floor(animationTime / 550) % 2) fill(target, '#BCE6EF', x + w * .47, y + h * .18, 3, 5);
    if (target === back) label(back, 'NƯỚC UỐNG', x + w / 2, y + h + 10, w + 22, { size: 7, padding: 2 });
  }

  function drawUtility(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const names = ['PHA CÀ PHÊ', 'NƯỚC TỰ ĐỘNG', 'TỦ LẠNH', 'TỦ BẾP'];
    const startY = y + 22;
    const slot = Math.max(34, (h - 26) / names.length);
    const unitX = x + 10;
    const unitW = Math.max(34, w - 20);
    label(back, rect.el.querySelector('strong')?.textContent, x + w / 2, y + 7, w + 16, { size: 8, padding: 2 });

    names.forEach(function (name, index) {
      const slotY = startY + index * slot;
      const deviceY = slotY + 14;
      const deviceH = Math.max(18, slot - 20);
      label(back, name, x + w / 2, slotY + 4, w - 4, { size: 6, padding: 2, background: '#244B6D', color: '#F4F0E5' });

      if (index === 0) {
        box(back, '#D8DDDF', unitX, deviceY, unitW, deviceH, colors.metal, 2);
        fill(back, '#263D4B', unitX + 7, deviceY + 5, unitW - 14, Math.max(5, deviceH * .28));
        fill(back, '#E7C86D', unitX + unitW * .42, deviceY + deviceH * .58, unitW * .16, 5);
        fill(back, '#F0E7C9', unitX + unitW * .33, deviceY + deviceH - 7, unitW * .34, 5);
      } else if (index === 1) {
        box(back, '#315F78', unitX, deviceY, unitW, deviceH, '#17364B', 2);
        for (let row = 0; row < 3; row += 1) fill(back, ['#70B6D1', '#E7C86D', '#C85D4C'][row], unitX + 7, deviceY + 5 + row * 7, unitW - 18, 4);
        fill(back, '#D5E4EA', unitX + unitW - 9, deviceY + deviceH - 8, 4, 4);
      } else if (index === 2) {
        box(back, '#D7E0E2', unitX, deviceY, unitW, deviceH, colors.metal, 2);
        line(back, '#8DA4AF', unitX + 5, deviceY + Math.max(8, deviceH * .48), unitW - 10, 2);
        line(back, '#536773', unitX + unitW - 10, deviceY + 5, 3, deviceH - 10);
      } else {
        box(back, '#8A6048', unitX, deviceY, unitW, deviceH, '#4D3428', 2);
        const microwaveW = Math.max(10, (unitW - 18) / 2);
        for (let microwave = 0; microwave < 2; microwave += 1) {
          box(back, '#D8DDDF', unitX + 5 + microwave * (microwaveW + 7), deviceY + 5, microwaveW, Math.max(8, deviceH - 13), '#465A67', 1);
          fill(back, '#263D4B', unitX + 8 + microwave * (microwaveW + 7), deviceY + 8, Math.max(5, microwaveW - 7), 5);
        }
      }
    });
  }

  function drawWindow(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let sky = '#82B7D1';
    let horizon = '#B8D8DF';
    let cloud = '#EEF7F7';
    let light = '#F0D36F';
    let phase = 'day';

    if (hour >= 5 && hour < 7) {
      sky = '#8EABC0'; horizon = '#E5B27A'; cloud = '#E9D7C2'; light = '#E7A04A'; phase = 'dawn';
    } else if (hour >= 7 && hour < 17) {
      sky = hour < 11 ? '#9CCBDD' : '#82B7D1';
      horizon = hour < 11 ? '#CFE3E1' : '#B8D8DF';
    } else if (hour >= 17 && hour < 19) {
      sky = '#766F88'; horizon = '#D68462'; cloud = '#C9B6B0'; light = '#E79549'; phase = 'dusk';
    } else {
      sky = '#182A43'; horizon = '#304968'; cloud = '#6F8194'; light = '#E5DFC3'; phase = 'night';
    }

    box(back, '#8A6F58', x, y, w, h, '#4A3D36', 4);
    back.save();
    back.beginPath();
    back.rect(snap(x + 9), snap(y + 9), Math.max(2, snap(w - 18)), Math.max(2, snap(h - 18)));
    back.clip();
    fill(back, sky, x + 9, y + 9, w - 18, h - 18);
    fill(back, horizon, x + 9, y + h * .58, w - 18, h * .42 - 9);

    if (phase === 'night') {
      const stars = [[.12, .24], [.25, .42], [.39, .19], [.54, .35], [.67, .18], [.79, .41], [.9, .27]];
      stars.forEach(function (star, index) {
        const blink = Math.floor(animationTime / 700 + index) % 3 === 0 ? 3 : 2;
        fill(back, index % 2 ? '#D7E2E8' : '#F0D36F', x + 9 + (w - 18) * star[0], y + 9 + (h - 18) * star[1], blink, blink);
      });
      fill(back, light, x + w - 42, y + 19, 14, 14);
      fill(back, sky, x + w - 36, y + 16, 12, 12);
    } else {
      const cloudX = ((animationTime / 65) % (w + 80)) - 55;
      fill(back, cloud, x + cloudX, y + 25, 42, 8);
      fill(back, '#F4F5EB', x + cloudX + 12, y + 18, 24, 9);
      const lightY = phase === 'day' ? y + 18 : y + h * .48;
      fill(back, light, x + w - 43, lightY, 12, 12);
    }

    line(back, '#D7E3E5', x + w / 3 - 2, y + 9, 4, h - 18);
    line(back, '#D7E3E5', x + w * 2 / 3 - 2, y + 9, 4, h - 18);
    line(back, '#D7E3E5', x + 9, y + h * .68 - 2, w - 18, 4);
    back.globalAlpha = phase === 'night' ? .12 : .24;
    line(back, '#FFFFFF', x + 18, y + 16, Math.max(24, w * .19), 4);
    line(back, '#FFFFFF', x + 28, y + 23, Math.max(18, w * .12), 3);
    back.globalAlpha = 1;
    back.restore();
  }

  function drawClock(rect) {
    const value = rect.el.textContent.trim();
    const x = rect.x, y = rect.y, w = Math.max(56, rect.w), h = Math.max(20, rect.h);
    fill(back, 'rgba(7,21,36,.28)', x + 5, y + 5, w, h);
    box(back, '#596874', x, y, w, h, colors.outline, 3);
    fill(back, '#1A2A36', x + 7, y + 6, w - 14, h - 12);
    fill(back, '#263E4D', x + 9, y + 8, w - 18, 3);
    fill(back, '#AEB8BE', x + 3, y + 3, 3, 3);
    fill(back, '#AEB8BE', x + w - 6, y + 3, 3, 3);
    fill(back, Math.floor(animationTime / 700) % 2 ? '#49C47A' : '#246D49', x + w - 11, y + h - 8, 4, 3);
    back.save();
    back.font = '700 ' + Math.max(8, Math.min(13, Math.round(h * .38))) + 'px "Courier New", monospace';
    back.textBaseline = 'middle';
    back.textAlign = 'center';
    back.fillStyle = '#F0D36F';
    back.fillText(value, snap(x + w / 2), snap(y + h * .57), w - 22);
    back.restore();
  }

  function drawCalendar(rect) {
    const dayNode = rect.el.querySelector('b');
    const labelNode = rect.el.querySelector('span');
    const day = dayNode ? dayNode.textContent.trim() : '--';
    const lines = labelNode ? labelNode.textContent.trim().split(/\s*\n\s*/) : [];
    const x = rect.x, y = rect.y, w = Math.max(82, rect.w), h = Math.max(26, rect.h);
    fill(back, 'rgba(7,21,36,.24)', x + 4, y + 4, w, h);
    box(back, '#F1E6C9', x, y, w, h, '#70402F', 3);
    fill(back, '#AE5B4B', x, y, Math.min(35, w * .31), h);
    line(back, '#70402F', x + Math.min(35, w * .31), y, 3, h);
    back.save();
    back.textAlign = 'center';
    back.textBaseline = 'middle';
    back.font = '800 ' + Math.max(11, Math.min(15, Math.round(h * .43))) + 'px "Courier New", monospace';
    back.fillStyle = '#FFF7E7';
    back.fillText(day, snap(x + Math.min(35, w * .31) / 2), snap(y + h * .54));
    back.font = '800 ' + Math.max(7, Math.min(9, Math.round(h * .24))) + 'px "Courier New", monospace';
    back.fillStyle = '#263746';
    const labelX = x + Math.min(35, w * .31) + (w - Math.min(35, w * .31)) / 2;
    back.fillText((lines[0] || '').toUpperCase(), snap(labelX), snap(y + h * .36), w - 42);
    back.fillText((lines[1] || '').toUpperCase(), snap(labelX), snap(y + h * .69), w - 42);
    back.restore();
  }

  function drawNapStorage(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    box(back, '#65735E', x, y, w, h, '#2E4437', 4);
    const colorsByChair = ['#D3B36B', '#8FA9B5', '#B77A70'];
    colorsByChair.forEach(function (color, index) {
      const chairX = x + 8 + index * Math.max(17, (w - 26) / 2);
      box(back, color, chairX, y + h * .29, 10, h * .58, index === 0 ? '#6A5331' : (index === 1 ? '#465F6B' : '#70453F'), 2);
      line(back, '#263746', chairX + 2, y + h * .77, 12, 2);
    });
    label(back, 'KHO GHẾ NGỦ', x + w / 2, y - 11, Math.max(72, w + 18), { size: 7, padding: 3 });
  }

  function drawNapBed(rect) {
    if (rect.el.dataset.active === 'false') return;
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    box(back, '#8FA9B5', x, y, w, h, '#405968', 3);
    box(back, '#F1E6C9', x + 6, y + 4, Math.max(15, w * .24), Math.max(9, h - 9), '#9E8C68', 2);
    line(back, '#405968', x + w * .34, y + h - 4, w * .58, 2);
  }

  function drawEntry(rect) {
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const state = rect.el.dataset.door || 'closed';
    const doorAt = Number(rect.el.dataset.doorAt || 0);
    let open = state === 'open' ? 1 : 0;
    if (state === 'opening') open = Math.min(1, Math.max(0, (animationTime - doorAt) / 640));
    if (state === 'closing') open = Math.min(1, Math.max(0, 1 - (animationTime - doorAt) / 640));
    const slide = Math.round(open * w);
    box(back, '#17100E', x, y, w, h, '#0E0A08', 4);
    box(back, '#6B4938', x - slide, y, w, h, '#3C2B25', 5);
    fill(back, '#8D6046', x - slide + 9, y + 9, w - 18, h - 12);
    fill(back, '#A9D1D7', x - slide + w * .23, y + 13, w * .54, h * .36);
    line(back, '#496E78', x - slide + w * .48, y + 13, 4, h * .36);
    box(back, colors.gold, x - slide + w - 21, y + h * .58, 7, 7, '#76572E', 2);
    label(back, 'EXIT', x + w / 2, Math.max(50, y - 13), Math.max(58, w), { size: 9, padding: 3, background: '#2C7A62', color: '#F4F0E5' });
    fill(front, '#3C2B25', x - 8, y + h - 7, w + 16, 7);
  }

  function drawCamera(rect) {
    const x = rect.x, y = rect.y, w = Math.max(24, rect.w), h = Math.max(14, rect.h);
    box(back, '#D5DBDE', x, y, w, h * .58, '#435362', 3);
    box(back, '#263847', x + w * .62, y + 3, w * .28, h * .36, colors.outline, 2);
    fill(back, Math.floor(animationTime / 600) % 2 ? '#C94F47' : '#6E2524', x + 5, y + 4, 4, 4);
    line(back, '#435362', x + w * .18, y + h * .56, 4, h * .62);
  }

  function drawAirConditioner(rect) {
    const x = rect.x, y = rect.y, w = Math.max(58, rect.w), h = Math.max(23, rect.h);
    box(back, '#E2E3DC', x, y, w, h, '#76848C', 3);
    line(back, '#99A6A9', x + 8, y + h * .58, w - 16, 3);
    for (let vent = 0; vent < 5; vent += 1) line(back, '#65747C', x + 11 + vent * ((w - 25) / 4), y + h * .67, 3, h * .16);
    const breeze = Math.floor(animationTime / 150) % 4;
    back.globalAlpha = .34;
    for (let strip = 0; strip < 3; strip += 1) fill(back, '#DCEEF1', x + 15 + strip * 17, y + h + 7 + breeze * 3, 11, 2);
    back.globalAlpha = 1;
  }

  function drawExtinguisher(rect) {
    const x = rect.x, y = rect.y, w = Math.max(15, rect.w), h = Math.max(31, rect.h);
    box(back, '#C94F47', x, y + 7, w, h - 7, '#722B2A', 3);
    box(back, '#343E48', x + w * .25, y, w * .5, 8, colors.outline, 2);
    fill(back, '#F3E8D6', x + 4, y + h * .47, w - 8, 7);
  }

  function drawSmokeDetector(rect) {
    const x = rect.x, y = rect.y, w = Math.max(18, rect.w), h = Math.max(10, rect.h);
    box(back, '#D8D9D4', x, y, w, h, '#6E7A80', 2);
    fill(back, Math.floor(animationTime / 900) % 2 ? '#C94F47' : '#7E3835', x + w * .45, y + h * .38, 3, 3);
  }

  function officeCharacterRects() {
    const stageRect = stage.getBoundingClientRect();
    return Array.from(stage.querySelectorAll('.ai-agent, .office-ambient-person, .office-visitor')).filter(function (element) {
      if (element.dataset.pose === 'seated') return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(function (element) {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - stageRect.left - 6,
        right: rect.right - stageRect.left + 6,
        top: rect.top - stageRect.top - 6,
        bottom: rect.bottom - stageRect.top + 6,
        footY: rect.top + rect.height * .78 - stageRect.top
      };
    });
  }

  function drawObjectForCharacters(rect, characters, depth, drawer) {
    const depthY = rect.y + rect.h * depth;
    characters.forEach(function (character) {
      const horizontalOverlap = character.right > rect.x - 7 && character.left < rect.x + rect.w + 7;
      const closeBehind = character.footY >= rect.y - 24 && character.footY < depthY;
      if (!horizontalOverlap || !closeBehind) return;
      front.save();
      front.beginPath();
      front.rect(character.left, character.top, character.right - character.left, character.bottom - character.top);
      front.clip();
      drawer(rect, front);
      front.restore();
    });
  }

  function drawSelectiveForeground() {
    const characters = officeCharacterRects();
    if (!characters.length) return;
    all('.office-process-cabinet').forEach(function (rect) { drawObjectForCharacters(rect, characters, .88, function (item, ctx) { drawCabinet(item, 'process', ctx); }); });
    all('.office-knowledge-cabinet').forEach(function (rect) { drawObjectForCharacters(rect, characters, .88, function (item, ctx) { drawCabinet(item, 'knowledge', ctx); }); });
    all('.office-cabinet').forEach(function (rect) { drawObjectForCharacters(rect, characters, .88, function (item, ctx) { drawCabinet(item, 'file', ctx); }); });
    all('.pixel-bookshelf').forEach(function (rect) { drawObjectForCharacters(rect, characters, .90, drawBookshelf); });
    all('.office-sofa').forEach(function (rect) { drawObjectForCharacters(rect, characters, .72, drawSofa); });
    all('.pixel-water-cooler').forEach(function (rect) { drawObjectForCharacters(rect, characters, .90, drawWater); });
    all('.office-plant').forEach(function (rect) { drawObjectForCharacters(rect, characters, .88, function (item, ctx) { drawPlant(item, false, ctx); }); });
    all('.pixel-plant').forEach(function (rect) { drawObjectForCharacters(rect, characters, .88, function (item, ctx) { drawPlant(item, true, ctx); }); });
  }

  function drawAtmosphere() {
    front.globalAlpha = .035;
    for (let y = 44; y < height; y += 4) fill(front, '#071524', 0, y, width, 1);
    front.globalAlpha = 1;
    fill(front, 'rgba(7,21,36,.20)', 0, height - 8, width, 8);
    fill(front, 'rgba(7,21,36,.16)', width - 8, 0, 8, height);
    drawNightLighting();
  }

  function drawNightLighting() {
    if (stage.dataset.lights !== 'off') return;
    front.fillStyle = 'rgba(4, 10, 24, .82)';
    front.fillRect(0, 0, width, height);
    function glow(x, y, radius, color) {
      const gradient = front.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      front.fillStyle = gradient;
      front.beginPath();
      front.arc(x, y, radius, 0, Math.PI * 2);
      front.fill();
    }
    const blink = Math.floor(animationTime / 900) % 2;
    glow(width * .16, height * .90, 30, 'rgba(44, 122, 98, .55)');
    glow(width * .87, height * .14, 20, blink ? 'rgba(228, 93, 85, .5)' : 'rgba(122, 43, 39, .32)');
    glow(width * .93, height * .16, 15, 'rgba(73, 196, 122, .4)');
    glow(width * .06, height * .12, 18, 'rgba(240, 211, 111, .38)');
    glow(width * .94, height * .11, 18, 'rgba(240, 211, 111, .38)');
    glow(width * .50, height * .08, 22, 'rgba(120, 169, 214, .28)');
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth; height = nextHeight;
    [backCanvas, frontCanvas].forEach(function (canvas) { canvas.width = width; canvas.height = height; });
    back.imageSmoothingEnabled = false;
    front.imageSmoothingEnabled = false;
    return true;
  }

  function paint(time) {
    frame = window.requestAnimationFrame(paint);
    if (document.hidden || time - lastPaint < 90) return;
    lastPaint = time;
    animationTime = reducedMotion ? 0 : time;
    resize();
    back.clearRect(0, 0, width, height);
    front.clearRect(0, 0, width, height);

    drawRoom(animationTime);
    all('.office-entry').forEach(drawEntry);
    all('.pixel-camera').forEach(drawCamera);
    all('.office-ac').forEach(drawAirConditioner);
    all('.fire-extinguisher').forEach(drawExtinguisher);
    all('.smoke-detector').forEach(drawSmokeDetector);
    all('.pixel-window').forEach(drawWindow);
    all('.office-station').forEach(drawStation);
    all('.leader-workstation').forEach(drawLeader);
    all('.pixel-meeting-table').forEach(drawMeeting);
    all('.pixel-reception').forEach(drawReception);
    all('.break-dining-set').forEach(function (rect, index) { drawDining(rect, index + 1); });
    all('.pixel-game-zone').forEach(drawGame);
    all('.server-room').forEach(drawServer);
    all('.print-workbench').forEach(drawPrintBench);
    all('.office-process-cabinet').forEach(function (rect) { drawCabinet(rect, 'process'); });
    all('.office-knowledge-cabinet').forEach(function (rect) { drawCabinet(rect, 'knowledge'); });
    all('.office-cabinet').forEach(function (rect) { drawCabinet(rect, 'file'); });
    all('.pixel-notice-board').forEach(drawNoticeBoard);
    all('.office-sofa').forEach(drawSofa);
    all('.pixel-bookshelf').forEach(drawBookshelf);
    all('.pixel-water-cooler').forEach(drawWater);
    all('.pixel-coffee-corner').forEach(drawUtility);
    all('.office-plant').forEach(function (rect) { drawPlant(rect, false); });
    all('.pixel-plant').forEach(function (rect) { drawPlant(rect, true); });
    all('.pixel-clock').forEach(drawClock);
    all('.pixel-calendar').forEach(drawCalendar);
    all('.pixel-nap-storage').forEach(drawNapStorage);
    all('.pixel-nap-bed').forEach(drawNapBed);
    drawSelectiveForeground();
    drawAtmosphere();
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(stage);
  window.addEventListener('resize', resize, { passive: true });
  resize();
  stage.classList.add('pixel-world-ready');
  frame = window.requestAnimationFrame(paint);

  window.PixelWorldEngine = {
    backCanvas: backCanvas,
    frontCanvas: frontCanvas,
    refresh: resize,
    destroy: function () {
      if (frame) window.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', resize);
      stage.classList.remove('pixel-world-ready');
      backCanvas.remove();
      frontCanvas.remove();
    }
  };
}());
