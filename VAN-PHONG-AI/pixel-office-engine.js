(function () {
  'use strict';

  const stage = document.querySelector('.ai-office-stage');
  const leader = document.getElementById('aiAgent');
  if (!stage || !leader || !window.HTMLCanvasElement) return;

  if (window.PixelOfficeEngine && typeof window.PixelOfficeEngine.destroy === 'function') {
    window.PixelOfficeEngine.destroy();
  }

  const people = Array.from(stage.querySelectorAll('.office-ambient-person, .office-visitor'));
  const canvas = document.createElement('canvas');
  canvas.className = 'pixel-sprite-layer';
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    canvas.remove();
    return;
  }

  context.imageSmoothingEnabled = false;
  const spriteCache = new Map();
  const particles = [];
  const previousPositions = new WeakMap();
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const spriteWidth = 24;
  const spriteHeight = 36;
  let stageWidth = 0;
  let stageHeight = 0;
  let animationFrame = 0;
  let lastPaint = 0;

  const tonePalettes = {
    blue: { shirt: '#316EA5', shirtDark: '#1F4E77', accent: '#86B9CD', hair: '#2D2928' },
    green: { shirt: '#2C7A62', shirtDark: '#195845', accent: '#83BFA5', hair: '#47372C' },
    coral: { shirt: '#AE5B4B', shirtDark: '#74382F', accent: '#E2A18E', hair: '#1D2730' },
    mustard: { shirt: '#B17A24', shirtDark: '#765018', accent: '#E7C86D', hair: '#513A28' },
    violet: { shirt: '#6E5B98', shirtDark: '#493C69', accent: '#B8A6D6', hair: '#24222A' },
    teal: { shirt: '#287C80', shirtDark: '#18585B', accent: '#76BEC0', hair: '#322E2A' }
  };

  const leaderPalette = {
    shirt: '#172A43', shirtDark: '#0B1828', accent: '#40536C', hair: '#2D2928', tie: '#9F3F4B'
  };

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === stageWidth && height === stageHeight) return;
    stageWidth = width;
    stageHeight = height;
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = false;
  }

  function percentValue(owner, property, fallback) {
    const raw = window.getComputedStyle(owner).getPropertyValue(property).trim();
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function characterPosition(element) {
    if (element === leader) {
      return {
        x: percentValue(stage, '--agent-x', 49),
        y: percentValue(stage, '--agent-y', 28)
      };
    }
    return {
      x: percentValue(element, '--npc-x', 50),
      y: percentValue(element, '--npc-y', 50)
    };
  }

  function characterScale(element) {
    const narrow = stageWidth <= 560;
    const medium = stageWidth <= 900;
    if (element === leader) return narrow ? 1.35 : (medium ? 1.72 : 2.18);
    return narrow ? 1.28 : (medium ? 1.66 : 2.06);
  }

  function personPhase(element) {
    const source = element.dataset.person || 'AN';
    let value = 0;
    for (let index = 0; index < source.length; index += 1) value += source.charCodeAt(index) * (index + 3);
    return value % 1000;
  }

  function spriteState(element, time) {
    const state = element.dataset.state || 'idle';
    const seated = element.dataset.pose === 'seated';
    const restingAtBreak = seated && element.dataset.breakSeated === 'true';
    const phase = personPhase(element);
    if (reducedMotion) return { pose: seated ? (restingAtBreak ? 'seat-rest' : 'typing') : 'idle', frame: 0, blink: false };
    const blink = ((time + phase * 11) % 4300) < 120;
    if (state === 'moving') return { pose: 'walk', frame: Math.floor((time + phase) / 118) % 4, blink: blink };
    if (state === 'sitting') return { pose: 'sitdown', frame: Math.floor((time + phase) / 150) % 2, blink: blink };
    if (state === 'standing') return { pose: 'standup', frame: Math.floor((time + phase) / 150) % 2, blink: blink };
    if (state === 'talking') return { pose: seated ? 'seat-talk' : 'talk', frame: Math.floor((time + phase) / 250) % 2, blink: blink };
    if (restingAtBreak) return { pose: 'seat-rest', frame: Math.floor((time + phase) / 820) % 2, blink: blink };
    if (seated) return { pose: 'typing', frame: Math.floor((time + phase) / 210) % 4, blink: blink };
    return { pose: 'idle', frame: Math.floor((time + phase) / 720) % 2, blink: blink };
  }

  function rect(ctx, color, x, y, width, height) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  function drawOutlinedBlock(ctx, fill, outline, x, y, width, height) {
    rect(ctx, outline, x - 1, y - 1, width + 2, height + 2);
    rect(ctx, fill, x, y, width, height);
  }

  function createSprite(role, palette, pose, frame, blink, phoneActive) {
    const key = [role, palette.shirt, palette.hair, pose, frame, blink ? 1 : 0, phoneActive ? 1 : 0].join('|');
    if (spriteCache.has(key)) return spriteCache.get(key);

    const sprite = document.createElement('canvas');
    sprite.width = spriteWidth;
    sprite.height = spriteHeight;
    const ctx = sprite.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const outline = '#091725';
    const skin = role === 'leader' ? '#D7A17C' : '#D9A27E';
    const skinDark = '#8A5946';
    const seated = pose === 'typing' || pose === 'seat-talk' || pose === 'seat-rest' || pose === 'sitdown';
    const walking = pose === 'walk';
    const talking = pose === 'talk' || pose === 'seat-talk';
    const bob = walking && (frame === 1 || frame === 3) ? -1 : 0;
    const bodyY = (seated ? 17 : 16) + bob;
    const headY = (seated ? 6 : 4) + bob;

    if (!seated) {
      const leftForward = walking && (frame === 0 || frame === 3);
      const rightForward = walking && (frame === 1 || frame === 2);
      const leftX = leftForward ? 6 : 8;
      const rightX = rightForward ? 14 : 12;
      const leftH = leftForward ? 9 : 8;
      const rightH = rightForward ? 9 : 8;
      drawOutlinedBlock(ctx, '#24364D', outline, leftX, 27 + bob, 4, leftH);
      drawOutlinedBlock(ctx, '#24364D', outline, rightX, 27 + bob, 4, rightH);
      rect(ctx, '#101D2D', leftX - (leftForward ? 1 : 0), 34 + bob, 6, 2);
      rect(ctx, '#101D2D', rightX - (rightForward ? 0 : 1), 34 + bob, 6, 2);
    } else {
      drawOutlinedBlock(ctx, '#30465E', outline, 6, 26, 5, 6);
      drawOutlinedBlock(ctx, '#30465E', outline, 13, 26, 5, 6);
      rect(ctx, '#101D2D', 5, 31, 6, 2);
      rect(ctx, '#101D2D', 13, 31, 6, 2);
    }

    const armLift = talking && frame === 1;
    const typingLeft = pose === 'typing' && (frame === 0 || frame === 2);
    const typingRight = pose === 'typing' && (frame === 1 || frame === 3);
    const walkLeft = walking && (frame === 0 || frame === 3);
    const walkRight = walking && (frame === 1 || frame === 2);

    const leftArmX = walkLeft ? 3 : 4;
    const rightArmX = walkRight ? 17 : 16;
    const leftArmY = seated ? (typingLeft ? 21 : 20) : (walkRight ? 18 : 17) + bob;
    const rightArmY = seated ? (typingRight ? 21 : 20) : (armLift ? 14 : (walkLeft ? 18 : 17)) + bob;
    const leftArmH = seated ? 7 : 9;
    const rightArmH = armLift ? 7 : (seated ? 7 : 9);
    drawOutlinedBlock(ctx, role === 'leader' ? palette.shirt : skin, role === 'leader' ? outline : skinDark, leftArmX, leftArmY, 3, leftArmH);
    drawOutlinedBlock(ctx, role === 'leader' ? palette.shirt : skin, role === 'leader' ? outline : skinDark, rightArmX, rightArmY, 3, rightArmH);
    if (role === 'leader') {
      rect(ctx, skin, leftArmX, leftArmY + leftArmH - 1, 3, 2);
      rect(ctx, skin, rightArmX, rightArmY + rightArmH - 1, 3, 2);
    }

    drawOutlinedBlock(ctx, palette.shirt, outline, 6, bodyY, 12, seated ? 12 : 13);
    rect(ctx, palette.shirtDark, 6, bodyY + 9, 12, seated ? 3 : 4);
    rect(ctx, palette.accent, 7, bodyY + 1, 2, seated ? 8 : 9);
    if (role === 'leader') {
      rect(ctx, '#F4F0E5', 10, bodyY, 4, 8);
      rect(ctx, palette.tie, 11, bodyY + 2, 2, 7);
      rect(ctx, palette.accent, 7, bodyY, 3, 6);
      rect(ctx, palette.accent, 14, bodyY, 3, 6);
      if (pose === 'walk' || pose === 'talk') {
        drawOutlinedBlock(ctx, '#E7C86D', '#8D7130', 18, bodyY + 5, 4, 7);
        rect(ctx, '#FFF4C2', 19, bodyY + 6, 2, 4);
      }
    } else {
      rect(ctx, '#EEF2F1', 11, bodyY, 2, 9);
      rect(ctx, palette.accent, 14, bodyY + 2, 2, 2);
    }

    if (!seated && role === 'courier') {
      drawOutlinedBlock(ctx, '#A86E4E', '#5D3C2E', 18, bodyY + 6, 5, 7);
      rect(ctx, '#F0E7C9', 19, bodyY + 8, 3, 2);
    } else if (!seated && role === 'visitor') {
      drawOutlinedBlock(ctx, '#40566B', outline, 18, bodyY + 7, 5, 6);
      rect(ctx, '#E7C86D', 20, bodyY + 6, 2, 2);
    }

    drawOutlinedBlock(ctx, skin, skinDark, 7, headY + 3, 10, 10);
    rect(ctx, palette.hair, 6, headY, 12, 5);
    rect(ctx, outline, 7, headY - 1, 10, 2);
    rect(ctx, palette.hair, 6, headY + 3, 2, 4);
    rect(ctx, palette.hair, 16, headY + 3, 2, 3);

    if (blink) {
      rect(ctx, '#3A2B29', 9, headY + 7, 3, 1);
      rect(ctx, '#3A2B29', 14, headY + 7, 3, 1);
    } else {
      rect(ctx, '#F8F4EA', 9, headY + 6, 3, 2);
      rect(ctx, '#F8F4EA', 14, headY + 6, 3, 2);
      rect(ctx, '#252A32', 10, headY + 6, 1, 2);
      rect(ctx, '#252A32', 15, headY + 6, 1, 2);
    }
    rect(ctx, skinDark, 12, headY + 8, 2, 1);
    rect(ctx, talking && frame === 1 ? '#6D3034' : '#763C3B', 11, headY + 11, talking && frame === 1 ? 4 : 3, talking && frame === 1 ? 2 : 1);

    if (pose === 'seat-rest') {
      drawOutlinedBlock(ctx, '#D9CFB4', '#77664E', 5, 29, 14, 3);
      rect(ctx, frame ? '#E7C86D' : '#D59B55', 8, 28, 5, 2);
      drawOutlinedBlock(ctx, '#D9E3DF', '#536176', 18, 24, 4, 6);
      rect(ctx, '#7D5135', 19, 25, 2, 2);
    }

    if (phoneActive) {
      const phoneY = seated ? 19 : 17;
      drawOutlinedBlock(ctx, '#1D2A38', outline, 16, phoneY, 5, 8);
      rect(ctx, '#78B6C3', 17, phoneY + 2, 3, 4);
      rect(ctx, '#E7C86D', 17, phoneY + 6, 3, 1);
    }

    spriteCache.set(key, sprite);
    return sprite;
  }

  function paletteFor(element) {
    if (element === leader) return leaderPalette;
    return tonePalettes[element.dataset.tone] || tonePalettes.blue;
  }

  function drawPixelShadow(x, y, scale, moving, seated) {
    const width = Math.round((seated ? 15 : (moving ? 12 : 14)) * scale);
    const height = Math.max(3, Math.round(3 * scale));
    const left = Math.round(x - width / 2);
    const top = Math.round(y - height / 2);
    context.globalAlpha = moving ? .28 : .36;
    rect(context, '#102540', left, top, width, height);
    context.globalAlpha = 1;
  }

  function drawCharacter(item, time) {
    const element = item.element;
    const scale = characterScale(element);
    const state = spriteState(element, time);
    const palette = paletteFor(element);
    const role = element === leader ? 'leader' : (element.classList.contains('office-visitor') ? (element.dataset.visitorKind || 'visitor') : 'staff');
    const sprite = createSprite(role, palette, state.pose, state.frame, state.blink, element.dataset.phoneActive === 'true');
    const width = Math.round(spriteWidth * scale);
    const height = Math.round(spriteHeight * scale);
    const x = Math.round(item.x / 100 * stageWidth);
    const y = Math.round(item.y / 100 * stageHeight);
    const seated = element.dataset.pose === 'seated' || state.pose === 'sitdown';
    const sleeping = element.dataset.napping === 'true';
    const anchor = seated ? .84 : .82;
    drawPixelShadow(x, y + Math.round(height * .13), scale, state.pose === 'walk', seated || sleeping);

    const previous = previousPositions.get(element);
    if (!reducedMotion && state.pose === 'walk' && previous && Math.hypot(x - previous.x, y - previous.y) > 3 && state.frame % 2 === 0) {
      const lastParticle = particles[particles.length - 1];
      if (!lastParticle || lastParticle.owner !== element || time - lastParticle.born > 150) {
        particles.push({ owner: element, x: x - (element.dataset.facing === 'left' ? -5 : 5), y: y + height * .12, born: time, life: 430 });
      }
    }
    previousPositions.set(element, { x: x, y: y });

    context.save();
    context.imageSmoothingEnabled = false;
    if (sleeping) {
      context.translate(x, y - Math.round(height * .16));
      context.rotate(Math.PI / 2);
      context.drawImage(sprite, Math.round(-width / 2), Math.round(-height * .62), width, height);
    } else if (element.dataset.facing === 'left') {
      context.translate(x, 0);
      context.scale(-1, 1);
      context.drawImage(sprite, Math.round(-width / 2), Math.round(y - height * anchor), width, height);
    } else {
      context.drawImage(sprite, Math.round(x - width / 2), Math.round(y - height * anchor), width, height);
    }
    context.restore();

  }

  function drawParticles(time) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      const progress = (time - particle.born) / particle.life;
      if (progress >= 1) {
        particles.splice(index, 1);
        continue;
      }
      const size = progress < .45 ? 4 : 2;
      context.globalAlpha = .34 * (1 - progress);
      rect(context, '#E9DFC3', particle.x + progress * 7, particle.y - progress * 6, size, size);
      rect(context, '#8C7B5F', particle.x - progress * 6, particle.y - progress * 3, 2, 2);
    }
    context.globalAlpha = 1;
  }

  function paint(time) {
    animationFrame = window.requestAnimationFrame(paint);
    if (document.hidden || time - lastPaint < 70) return;
    lastPaint = time;
    resizeCanvas();
    context.clearRect(0, 0, stageWidth, stageHeight);

    const characters = [leader].concat(people).filter(function (element) {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(function (element) {
      const position = characterPosition(element);
      return { element: element, x: position.x, y: position.y };
    }).sort(function (first, second) {
      return first.y - second.y;
    });

    characters.forEach(function (item) { drawCharacter(item, time); });
    drawParticles(time);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resizeCanvas) : null;
  if (observer) observer.observe(stage);
  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  stage.classList.add('pixel-sprite-ready');
  animationFrame = window.requestAnimationFrame(paint);

  window.PixelOfficeEngine = {
    canvas: canvas,
    refresh: resizeCanvas,
    destroy: function () {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      stage.classList.remove('pixel-sprite-ready');
      canvas.remove();
    }
  };
}());
