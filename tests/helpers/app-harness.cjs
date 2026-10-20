// Exercise the real application's registered input handlers, updateDetail and
// follow/reset/resize call chain. Only static scenery and glyph measurement are
// replaced: camera functions, runner motion/rendering and DOM event wiring run.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
function harness(width = 1280, height = 720, options = {}) {
  const frames = new Map(),
    windowListeners = new Map(),
    documentListeners = new Map(),
    nodes = new Map(),
    stats = {
      viewBoxWrites: 0,
      rectReads: 0,
      clientReads: 0,
      ctmReads: 0,
      styleWrites: 0,
      lodWrites: 0,
      routeAttrWrites: 0,
      routeStyleWrites: 0,
      routePathWrites: 0,
    };
  let nextFrame = 1;
  class Node {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.children = [];
      this.parentNode = null;
      this.attributes = {};
      this.dataset = {};
      this.listeners = new Map();
      this.value = '';
      this.hidden = false;
      this._classes = new Set();
      this._style = {};
      this.style = {
        setProperty: (name, value) => {
          if (this.id === 'stadium') stats.styleWrites++;
          this._style[name] = String(value);
        },
      };
      this.classList = {
        contains: (c) => this._classes.has(c),
        add: (c) => this._classes.add(c),
        remove: (c) => this._classes.delete(c),
        toggle: (c, on) => {
          if (
            this.id === 'stadium' &&
            ['marker-detail', 'detail-labels', 'fine-detail', 'rubber-detail'].includes(c)
          )
            stats.lodWrites++;
          const v = on === undefined ? !this._classes.has(c) : on;
          v ? this._classes.add(c) : this._classes.delete(c);
          return v;
        },
      };
    }
    get clientWidth() {
      if (this.id === 'stadium') stats.clientReads++;
      return width;
    }
    get clientHeight() {
      if (this.id === 'stadium') stats.clientReads++;
      return height;
    }
    setAttribute(name, value) {
      if (this.parentNode?.id === 'route-layer') {
        stats.routeAttrWrites++;
        if (name === 'd') stats.routePathWrites++;
      }
      this.attributes[name] = String(value);
      if (name === 'class') this._classes = new Set(String(value).split(/\s+/));
      if (name.startsWith('data-'))
        this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (name === 'id') {
        this.id = String(value);
        nodes.set(this.id, this);
      }
      if (this.id === 'stadium' && name === 'viewBox') stats.viewBoxWrites++;
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    removeAttribute(name) {
      delete this.attributes[name];
    }
    append(...children) {
      for (const child of children) {
        this.children.push(child);
        child.parentNode = this;
        if (child.id) nodes.set(child.id, child);
      }
    }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    addEventListener(name, fn) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(fn);
    }
    dispatch(name, extra = {}) {
      const e = {
        target: this,
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        deltaY: 0,
        deltaMode: 0,
        detail: name === 'click' ? 1 : 0,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.propagationStopped = true;
        },
        stopImmediatePropagation() {
          this.immediatePropagationStopped = true;
        },
        ...extra,
      };
      for (const fn of this.listeners.get(name) || []) {
        fn(e);
        if (e.immediatePropagationStopped) break;
      }
      return e;
    }
    getBoundingClientRect() {
      if (this.id === 'stadium') {
        stats.rectReads++;
        return { left: 40, top: 25, width, height, right: 40 + width, bottom: 25 + height };
      }
      return this.id === 'top-controls' ? { bottom: 83 } : { top: height - 45 };
    }
    createSVGPoint() {
      return {
        x: 0,
        y: 0,
        matrixTransform(m) {
          return { x: this.x * m.a + m.e, y: this.y * m.d + m.f };
        },
      };
    }
    getScreenCTM() {
      stats.ctmReads++;
      const b = (this.attributes.viewBox || '3 13 190 110').split(' ').map(Number),
        s = Math.min(width / b[2], height / b[3]),
        ox = (width - b[2] * s) / 2,
        oy = (height - b[3] * s) / 2;
      return {
        inverse: () => ({ a: 1 / s, d: 1 / s, e: b[0] - (40 + ox) / s, f: b[1] - (25 + oy) / s }),
      };
    }
    setPointerCapture() {}
    matches(selector) {
      let s = selector.trim(),
        ok = true;
      s = s.replace(/:not\((\.[\w-]+)\)/g, (_, excluded) => {
        if (this.matches(excluded)) ok = false;
        return '';
      });
      s = s.replace(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g, (_, name, value) => {
        if (
          value === undefined ? this.getAttribute(name) === null : this.getAttribute(name) !== value
        )
          ok = false;
        return '';
      });
      if (!ok) return false;
      const classes = [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (classes.some((c) => !this._classes.has(c))) return false;
      const tag = s.replace(/\.[\w-]+/g, '');
      return !tag || tag === '*' || tag === this.tagName.toLowerCase();
    }
    closest(selector) {
      for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node;
      return null;
    }
    contains(node) {
      for (let current = node; current; current = current.parentNode)
        if (current === this) return true;
      return false;
    }
    querySelectorAll(selector) {
      const sels = selector.split(','),
        found = [];
      for (const child of this.children) {
        if (sels.some((s) => child.matches(s))) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }
  for (const id of [
    'stadium',
    'world',
    'event-select',
    'runner-layer',
    'route-layer',
    'timeline',
    'play',
    'speed',
    'group-start',
    'top-controls',
    'bottom-controls',
    'event-picker-list',
    'language',
    'main',
  ])
    nodes.set(id, new Node(id === 'stadium' ? 'svg' : 'div', id));
  const svg = nodes.get('stadium');
  svg.setAttribute('viewBox', '3 13 190 110');
  svg.append(nodes.get('world'));
  nodes.get('world').append(nodes.get('route-layer'), nodes.get('runner-layer'));
  const document = {
    documentElement: new Node('html'),
    getElementById: (id) => nodes.get(id) || null,
    createElement: (tag) => new Node(tag),
    createElementNS: (_ns, tag) => new Node(tag),
    querySelector: (s) =>
      s === 'main'
        ? nodes.get('main')
        : s === '.top-controls'
          ? nodes.get('top-controls')
          : s === '.bottom-controls'
            ? nodes.get('bottom-controls')
            : null,
    querySelectorAll: (s) => svg.querySelectorAll(s),
    addEventListener: (name, fn) => {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(fn);
    },
    activeElement: null,
  };
  const window = {
    addEventListener: (name, fn) => {
      windowListeners.set(name, fn);
    },
  };
  const ctx = {
    window,
    document,
    navigator: { language: options.language || 'zh-CN' },
    Math,
    console,
    innerHeight: height,
    requestAnimationFrame: (fn) => {
      const id = nextFrame++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  vm.createContext(ctx);
  const seam = `\n// Static paint is unrelated to the camera; real dynamic runners are retained.\ndrawBase=()=>{};centerLabel=node=>node;centerAllLabels=()=>{};initEventPicker=()=>{};drawEvent=()=>{drawRoutes();createRunnerNodes()};\nwindow.CameraHarness={Locale,refreshLocale,displayedPoint,centerLane,allFinishDistance,courseParameter,updateRoutes,events:EVENTS,state,setBox,setView,zoom,reset,update,frame,changeEvent,selectTeam,togglePlay,raceEndDistance};\ninit();\n`;
  const app = require('./load-app.cjs').withBootstrap(seam);
  vm.runInContext(require('./source.cjs').readSource('track-data.js') + '\n' + app, ctx, {
    filename: 'integrated-track-app.js',
  });
  const api = window.CameraHarness;
  const clear = () => {
    for (const k of Object.keys(stats)) stats[k] = 0;
  };
  clear();
  return {
    focus(node) {
      document.activeElement = node;
    },
    document,
    api,
    svg,
    nodes,
    stats,
    clear,
    frames,
    events: window.TrackApp.events,
    setHidden(value) {
      document.hidden = value;
      for (const fn of documentListeners.get('visibilitychange') || []) fn({});
    },
    windowDispatch(name, event = {}) {
      windowListeners.get(name)?.(event);
    },
    documentDispatch(name, extra = {}) {
      const event = {
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...extra,
      };
      for (const fn of documentListeners.get(name) || []) fn(event);
      return event;
    },
    flush(now = 1000) {
      const batch = [...frames.values()];
      frames.clear();
      for (const f of batch) f(now);
    },
    resize(w, h) {
      width = w;
      height = h;
      ctx.innerHeight = h;
      windowListeners.get('resize')();
    },
    box: () => Array.from(api.state.box),
  };
}
module.exports = harness;
