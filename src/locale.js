/* Interface text only: changing language must not alter race or camera state. */
const Locale = (() => {
  const dictionaries = {
    en: {
      app: 'Athletics Simulator',
      scene: 'Interactive standard 400 m, eight-lane athletics track',
      choose: 'Choose track event',
      events: 'Track events',
      groups: 'Toggle two-group start',
      play: 'Play simulation',
      pause: 'Pause simulation',
      progress: 'Race progress',
      speed: 'Playback speed: {speed} times',
      changeSpeed: 'Change playback speed',
      changeLanguage: '切换至简体中文',
      metres: 'm',
      athlete: 'Athlete {number}',
      team: 'Team {letter}',
      leg: '{team}, leg {leg}{phase}',
      waiting: ', waiting in exchange zone',
      accelerating: ', accelerating in exchange zone',
      decelerating: ', decelerating after handover',
      retired: ', handover complete',
      breakLine: 'Break line',
      groupMerge: 'Outer-group merge point',
    },
    'zh-Hans': {
      app: '田径场',
      scene: '可交互的标准400米八道田径场',
      choose: '选择径赛项目',
      events: '径赛项目',
      groups: '切换两组起跑',
      play: '播放演示',
      pause: '暂停演示',
      progress: '比赛进度',
      speed: '播放倍数：{speed} 倍',
      changeSpeed: '切换播放倍数',
      changeLanguage: 'Switch to English',
      metres: '米',
      athlete: '{number} 号',
      team: '{letter} 队',
      leg: '{team}：第{leg}棒{phase}',
      waiting: '区内待接',
      accelerating: '区内加速接棒',
      decelerating: '交棒后减速',
      retired: '已交棒',
      breakLine: '抢道线',
      groupMerge: '外组汇合点',
    },
  };
  let language = 'en';
  try {
    const saved = globalThis.localStorage?.getItem('athletics-simulator.locale');
    const browser = typeof navigator === 'undefined' ? 'en' : navigator.language;
    language =
      saved === 'en' || saved === 'zh-Hans' ? saved : /^zh/i.test(browser) ? 'zh-Hans' : 'en';
  } catch {
    language =
      typeof navigator !== 'undefined' && /^zh/i.test(navigator.language) ? 'zh-Hans' : 'en';
  }
  function text(key, values = {}) {
    const value = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
    return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  }
  function eventLabel(event) {
    if (language === 'zh-Hans') return event.label;
    if (event.id === 'mile') return '1 mile';
    const distance = event.id
      .replace(/^4x/, '4 × ')
      .replace(/h$/, ' m hurdles')
      .replace(/sc$/, ' m steeplechase');
    if (event.id.startsWith('4x')) return `${distance} m relay`;
    return /h$|sc$/.test(event.id) ? distance : `${distance} m`;
  }
  function toggle() {
    language = language === 'en' ? 'zh-Hans' : 'en';
    try {
      globalThis.localStorage?.setItem('athletics-simulator.locale', language);
    } catch {
      // File previews and privacy modes may disable storage. The session still works.
    }
  }
  return {
    text,
    eventLabel,
    toggle,
    get language() {
      return language;
    },
  };
})();
