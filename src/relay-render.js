const runnerDOMCache = new WeakMap();
function runnerDOM(node) {
  let cache = runnerDOMCache.get(node);
  if (!cache) {
    cache = { attributes: new Map(), classes: new Map(), text: undefined };
    runnerDOMCache.set(node, cache);
  }
  return cache;
}
function runnerAttribute(node, name, value) {
  const cache = runnerDOM(node),
    text = String(value);
  if (cache.attributes.get(name) === text) return;
  node.setAttribute(name, text);
  cache.attributes.set(name, text);
}
function runnerRemoveAttribute(node, name) {
  const cache = runnerDOM(node);
  if (cache.attributes.get(name) === null) return;
  node.removeAttribute(name);
  cache.attributes.set(name, null);
}
function runnerClass(node, name, on) {
  const cache = runnerDOM(node);
  if (cache.classes.get(name) === on) return;
  node.classList.toggle(name, on);
  cache.classes.set(name, on);
}
function runnerText(node, text) {
  const cache = runnerDOM(node);
  if (cache.text === text) return;
  node.textContent = text;
  cache.text = text;
}
function makeToken(parent, index, leg, waiting = false) {
  const packed = ['waterfall', 'steeple'].includes(state.event.kind),
    g = elGroup(parent, {
      class:
        'athlete' +
        (isRelay() ? ' relay-runner' : '') +
        (waiting ? ' waiting' : '') +
        (packed ? ' pack-runner' : ''),
      'data-runner': index,
      'data-leg': leg,
      tabindex: waiting ? -1 : 0,
      role: waiting ? 'img' : 'button',
      ...(waiting ? {} : { 'aria-pressed': 'false' }),
    });
  element(
    'circle',
    {
      class: 'selection-ring',
      cx: 0,
      cy: 0,
      r: packed ? 0.28 : 0.32,
      fill: 'none',
      stroke: '#fff7e7',
    },
    undefined,
    g
  );
  const cache = runnerDOM(g);
  element(
    'circle',
    {
      class: 'token-body',
      cx: 0,
      cy: 0,
      r: packed ? 0.21 : 0.27,
      fill: TEAMS[index % 8],
      stroke: '#fff7e7',
    },
    undefined,
    g
  );
  centerLabel(
    element(
      'text',
      {
        x: 0,
        y: 0,
        class: 'point-label',
        fill: '#253c30',
        'data-max-ink-width': packed ? 0.3 : 0.36,
        'data-max-ink-height': packed ? 0.23 : 0.31,
        'aria-hidden': 'true',
      },
      isRelay() ? String.fromCharCode(65 + (index % 8)) + leg : String(leg),
      g
    )
  );
  cache.title = element('title', {}, '', g);
  return g;
}
function createRunnerNodes() {
  const layer = $('runner-layer');
  layer.replaceChildren();
  state.runners = [];
  state.routes.forEach((route, i) => {
    if (isRelay()) {
      const rawModel = RelayMotion.create({
        kind: state.event.kind,
        teamIndex: i,
        position: route.coursePoint,
        breakDistance: route.breakD,
        laneWidth: G.w,
        teamCount: state.routes.length,
        teamGap: 0,
        runOutDistance: 96,
      });
      const model = Object.freeze({
        ...rawModel,
        endDistance: raceEndDistance(),
        finishDistance: route.finishDistance,
        sample: (clock) => rawModel.sample(courseParameter(route, clock)),
        batonPosition: (clock) => rawModel.batonPosition(courseParameter(route, clock)),
        teamDistance: (clock) => courseParameter(route, clock),
      });
      route.motion = model;
      const athletes = [1, 2, 3, 4].map((leg) => makeToken(layer, i, leg, leg > 1));
      state.runners.push({ athletes, model });
    } else state.runners.push({ active: makeToken(layer, i, i + 1), waiting: [] });
  });
}
function updateRelayNode(node, a, index) {
  const holding = a.holding,
    chosen = state.selected < 0 || state.selected === index;
  runnerAttribute(node, 'display', a.visible ? '' : 'none');
  runnerAttribute(node, 'aria-hidden', String(!a.visible));
  runnerClass(node, 'waiting', !holding);
  runnerAttribute(node, 'data-phase', a.phase);
  runnerAttribute(node, 'data-holding', String(holding));
  runnerAttribute(node, 'data-selected', String(state.selected === index));
  runnerAttribute(node, 'role', holding ? 'button' : 'img');
  runnerAttribute(node, 'tabindex', holding ? 0 : -1);
  if (holding) runnerAttribute(node, 'aria-pressed', String(state.selected === index));
  else runnerRemoveAttribute(node, 'aria-pressed');
  if (!a.visible) return;
  runnerAttribute(node, 'transform', `translate(${a.x} ${a.y})`);
  runnerAttribute(node, 'opacity', a.alpha * (chosen ? 1 : 0.38));
  const cache = runnerDOM(node);
  const phase = ['waiting', 'accelerating', 'decelerating', 'retired'].includes(a.phase)
    ? Locale.text(a.phase)
    : '';
  const name = Locale.text('leg', { team: teamName(index), leg: a.leg, phase }),
    title = cache.title || (cache.title = node.querySelector('title'));
  runnerText(title, name);
  runnerAttribute(node, 'aria-label', name);
}
function athletePoint(route, d) {
  return displayedPoint(route, d);
}
function followPoint(index, frame) {
  if (!isRelay()) return athletePoint(state.routes[index], state.distance);
  // Tokens are drawn at the athlete's body, not at the invisible grip/baton.
  // Reuse the frame already drawn during playback; sample only on selection.
  const motion = frame || state.runners[index].model.sample(state.distance);
  return motion.athletes[motion.activeLeg - 1];
}
function updateRunners() {
  const e = state.event,
    d = state.distance;
  state.routes.forEach((route, i) => {
    const runner = state.runners[i];
    if (isRelay()) {
      const motion = runner.model.sample(d);
      runner.frame = motion;
      runner.athletes.forEach((node, j) => updateRelayNode(node, motion.athletes[j], i));
    } else {
      const active = runner.active,
        p = athletePoint(route, d);
      runnerAttribute(active, 'transform', `translate(${p.x} ${p.y})`);
      runnerAttribute(active, 'opacity', state.selected < 0 || state.selected === i ? 1 : 0.38);
      runnerAttribute(active, 'aria-pressed', String(state.selected === i));
      const name = teamName(i),
        cache = runnerDOM(active),
        title = cache.title || (cache.title = active.querySelector('title'));
      runnerText(title, name);
      runnerAttribute(active, 'aria-label', name);
    }
  });
  const blockAlpha = 1 - mergeC2((d - 4) / 4);
  document.querySelectorAll('.starting-block').forEach((n) => {
    runnerAttribute(n, 'opacity', blockAlpha);
    runnerAttribute(n, 'display', blockAlpha > 0 ? '' : 'none');
  });
  updateRoutes();
  const firstZone = $('first-exchange-zone'),
    commonZone = $('common-exchange-zone'),
    relayConfig = RelayMotion.config[e.kind],
    firstAlpha = relayConfig
      ? 1 - mergeC2((d - relayConfig.firstZoneFadeStart) / relayConfig.zoneFade)
      : 1,
    commonAlpha = relayConfig
      ? mergeC2((d - relayConfig.commonZoneFadeStart) / relayConfig.zoneFade)
      : 0;
  if (firstZone) {
    runnerAttribute(firstZone, 'opacity', firstAlpha);
    runnerAttribute(firstZone, 'display', firstAlpha > 0 ? '' : 'none');
  }
  if (commonZone) {
    runnerAttribute(commonZone, 'opacity', commonAlpha);
    runnerAttribute(commonZone, 'display', commonAlpha > 0 ? '' : 'none');
  }
  SC.updateBarrierVisibility($('steeple-barriers'), d);
  if (state.view === 'follow') {
    const i = state.selected >= 0 ? state.selected : 0,
      runner = state.runners[i],
      a = followPoint(i, runner.frame),
      p = project(a),
      box = camera.box(),
      w = box[2],
      h = box[3];
    setBox([p.x - w / 2, p.y - h / 2, w, h]);
  }
}
