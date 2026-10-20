'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readSource } = require('./helpers/source.cjs');
const harness = require('./helpers/app-harness.cjs');
let checks = 0;
function locale({ browser = 'en-US', saved, unavailable = false } = {}) {
  const writes = [];
  const storage = unavailable
    ? {
        getItem() {
          throw Error('Storage unavailable');
        },
      }
    : { getItem: () => saved, setItem: (key, value) => writes.push([key, value]) };
  const context = vm.createContext({ navigator: { language: browser }, localStorage: storage });
  vm.runInContext(
    readSource('track-data.js') +
      '\n' +
      readSource('locale.js') +
      '\nglobalThis.qa={Locale,EVENTS};',
    context
  );
  return { ...context.qa, writes };
}
for (const [options, expected] of [
  [{}, 'en'],
  [{ browser: 'zh-CN' }, 'zh-Hans'],
  [{ browser: 'zh-TW' }, 'zh-Hans'],
  [{ browser: 'en-GB', saved: 'zh-Hans' }, 'zh-Hans'],
  [{ browser: 'zh-CN', saved: 'en' }, 'en'],
  [{ saved: 'unsupported' }, 'en'],
  [{ browser: 'zh-CN', unavailable: true }, 'zh-Hans'],
]) {
  const q = locale(options);
  assert.equal(q.Locale.language, expected);
  checks++;
  for (const event of q.EVENTS) {
    const label = q.Locale.eventLabel(event);
    assert.equal(typeof label, 'string');
    assert(label.length > 0);
    assert(!/undefined|NaN/.test(label));
    checks += 3;
  }
  q.Locale.toggle();
  assert.notEqual(q.Locale.language, expected);
  checks++;
  q.Locale.toggle();
  assert.equal(q.Locale.language, expected);
  checks++;
}
const q = locale();
assert.equal(q.Locale.eventLabel(q.EVENTS.find((e) => e.id === 'mile')), '1 mile');
assert.equal(q.Locale.eventLabel(q.EVENTS.find((e) => e.id === '4x400')), '4 × 400 m relay');
assert.equal(q.Locale.eventLabel(q.EVENTS.find((e) => e.id === '110h')), '110 m hurdles');
assert.equal(q.Locale.eventLabel(q.EVENTS.find((e) => e.id === '3000sc')), '3000 m steeplechase');
assert.equal(q.Locale.text('speed', { speed: 2 }), 'Playback speed: 2 times');
checks += 5;
for (const language of ['en-US', 'zh-CN'])
  for (const event of ['100', '5000', '4x400']) {
    const h = harness(1280, 720, { language });
    h.api.changeEvent(event);
    h.api.state.distance = 43;
    h.api.update();
    h.api.selectTeam(2);
    h.api.togglePlay();
    const before = {
      distance: h.api.state.distance,
      playing: h.api.state.playing,
      selected: h.api.state.selected,
      view: h.api.state.view,
      speed: h.api.state.speed,
      box: h.box(),
    };
    const previousLanguage = h.api.Locale.language;
    h.nodes.get('language').dispatch('click');
    assert.notEqual(h.api.Locale.language, previousLanguage);
    assert.equal(h.document.documentElement.lang, h.api.Locale.language);
    assert.equal(
      h.document.title,
      h.api.Locale.eventLabel(h.api.state.event) + ' · ' + h.api.Locale.text('app')
    );
    assert.equal(h.nodes.get('main').getAttribute('aria-label'), h.api.Locale.text('app'));
    assert.equal(
      h.nodes.get('event-select').children.find((option) => option.value === event).textContent,
      h.api.Locale.eventLabel(h.api.state.event)
    );
    assert.deepEqual(
      {
        distance: h.api.state.distance,
        playing: h.api.state.playing,
        selected: h.api.state.selected,
        view: h.api.state.view,
        speed: h.api.state.speed,
        box: h.box(),
      },
      before,
      'language changes preserve the complete race and camera state'
    );
    checks += 6;
    h.nodes.get('language').dispatch('click');
    assert.equal(h.api.Locale.language, previousLanguage);
    checks++;
  }
console.log(
  `${checks} locale selection, catalog, storage fallback and state-preservation checks passed.`
);
