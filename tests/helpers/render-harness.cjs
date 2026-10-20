'use strict';
const vm = require('node:vm');
const { readSource } = require('./source.cjs');
const loadApp = require('./load-app.cjs');
function environment() {
  let counts = { writes: 0, changed: 0, queries: 0, textWrites: 0, unchangedTextWrites: 0 },
    all = [];
  const ids = new Map(),
    tagged = new Map(),
    camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    dash = (name) => name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  function matches(node, selector) {
    if (selector.includes(',')) return selector.split(',').some((s) => matches(node, s.trim()));
    if (selector[0] === '.') return node.classSet.has(selector.slice(1));
    if (selector[0] === '#') return node.getAttribute('id') === selector.slice(1);
    if (selector[0] === '[') {
      const m = selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
      return (
        m && node.attributes.has(m[1]) && (m[2] === undefined || node.getAttribute(m[1]) === m[2])
      );
    }
    return node.tag === selector;
  }
  function descendants(node) {
    return node.children.flatMap((n) => [n, ...descendants(n)]);
  }
  class Node {
    constructor(tag) {
      this.tag = tag;
      this.attributes = new Map();
      this.children = [];
      this.classSet = new Set();
      this.styles = {};
      this._text = '';
      all.push(this);
      const self = this;
      this.style = new Proxy(
        {
          setProperty(name, value) {
            self.setStyle(name, value);
          },
        },
        {
          set(_o, k, v) {
            self.setStyle(k, v);
            return true;
          },
          get(o, k) {
            return k in o ? o[k] : self.styles[k];
          },
        }
      );
      this.dataset = new Proxy(
        {},
        {
          get(_o, k) {
            return self.attributes.get('data-' + dash(String(k)));
          },
          set(_o, k, v) {
            self.setAttribute('data-' + dash(String(k)), v);
            return true;
          },
        }
      );
      this.classList = {
        contains: (c) => this.classSet.has(c),
        toggle(c, on) {
          counts.writes++;
          const before = self.classSet.has(c);
          if (before !== on) counts.changed++;
          if (on) self.classSet.add(c);
          else self.classSet.delete(c);
          self.attributes.set('class', [...self.classSet].join(' '));
          return on;
        },
      };
    }
    setStyle(k, v) {
      counts.writes++;
      if (this.styles[k] !== String(v)) counts.changed++;
      this.styles[k] = String(v);
    }
    setAttribute(k, v) {
      v = String(v);
      counts.writes++;
      if (this.attributes.get(k) !== v) counts.changed++;
      this.attributes.set(k, v);
      if (k === 'class') this.classSet = new Set(v.split(/\s+/).filter(Boolean));
      if (k === 'id') ids.set(v, this);
    }
    getAttribute(k) {
      return this.attributes.get(k) ?? null;
    }
    removeAttribute(k) {
      counts.writes++;
      if (this.attributes.has(k)) counts.changed++;
      this.attributes.delete(k);
    }
    append(...nodes) {
      this.children.push(...nodes);
      nodes.forEach((n) => (n.parent = this));
    }
    replaceChildren(...nodes) {
      this.children = [];
      this._text = '';
      this.append(...nodes);
    }
    get textContent() {
      return this._text + this.children.map((n) => n.textContent).join('');
    }
    set textContent(value) {
      counts.writes++;
      counts.textWrites++;
      if (this.textContent === String(value)) counts.unchangedTextWrites++;
      else counts.changed++;
      this._text = String(value);
      this.children = [];
    }
    querySelector(selector) {
      counts.queries++;
      return descendants(this).find((n) => matches(n, selector)) ?? null;
    }
    querySelectorAll(selector) {
      counts.queries++;
      return descendants(this).filter((n) => matches(n, selector));
    }
    get clientWidth() {
      return 1297;
    }
    get clientHeight() {
      return 641;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1297, height: 641, right: 1297, bottom: 641 };
    }
  }
  const body = new Node('body');
  function byId(id) {
    let n = ids.get(id);
    if (!n) {
      n = new Node(id === 'stadium' ? 'svg' : 'g');
      n.setAttribute('id', id);
      body.append(n);
    }
    return n;
  }
  const document = {
    body,
    getElementById: byId,
    querySelectorAll(selector) {
      counts.queries++;
      return descendants(body).filter((n) => matches(n, selector));
    },
    createElementNS(_ns, tag) {
      return new Node(tag);
    },
    createElement(tag) {
      if (tag === 'canvas')
        return {
          getContext() {
            return {
              font: '',
              measureText(text) {
                return {
                  actualBoundingBoxLeft: 0.02 * 1024,
                  actualBoundingBoxRight: (0.6 * String(text).length - 0.02) * 1024,
                  actualBoundingBoxAscent: 0.74 * 1024,
                  actualBoundingBoxDescent: 0.02 * 1024,
                };
              },
            };
          },
        };
      return new Node(tag);
    },
  };
  const context = {
    window: {},
    document,
    console,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    getComputedStyle: (n) => ({
      fontSize: n.style.fontSize || (n.parent?.classSet.has('pack-runner') ? '.26px' : '.3px'),
      fontFamily: 'Menlo',
      fontWeight: '600',
    }),
  };
  vm.createContext(context);
  vm.runInContext(
    readSource('track-data.js') +
      '\n' +
      loadApp.withBootstrap(
        'window.RenderQA={state,createRoutes,createRunnerNodes,updateRunners};'
      ),
    context
  );
  const qa = context.window.RenderQA;
  function setup(event) {
    qa.state.event = context.window.TrackApp.events.find((e) => e.id === event);
    qa.state.selected = -1;
    qa.state.view = 'manual';
    qa.createRoutes();
    qa.createRunnerNodes();
    const routeLayer = byId('route-layer');
    routeLayer.replaceChildren();
    qa.state.routeNodes = qa.state.routes.map(() => {
      const line = new Node('path'),
        arrow = new Node('path');
      routeLayer.append(line, arrow);
      return { line, arrow };
    });
    byId('first-exchange-zone');
    byId('common-exchange-zone');
    byId('steeple-barriers');
    const starts = byId('start-layer');
    starts.replaceChildren();
    for (let j = 0; j < 8; j++) {
      const n = new Node('g');
      n.setAttribute('class', 'starting-block');
      starts.append(n);
    }
  }
  function frame(d, selected = -1) {
    qa.state.distance = d;
    qa.state.selected = selected;
    qa.updateRunners();
  }
  function snapshot(node = body) {
    return {
      tag: node.tag,
      attrs: [...node.attributes].sort(([a], [b]) => a.localeCompare(b)),
      style: Object.entries(node.styles).sort(([a], [b]) => a.localeCompare(b)),
      text: node._text,
      children: node.children.map(snapshot),
    };
  }
  function resetCounts() {
    counts = { writes: 0, changed: 0, queries: 0, textWrites: 0, unchangedTextWrites: 0 };
  }
  return { qa, document, setup, frame, snapshot, resetCounts, counts: () => ({ ...counts }) };
}

module.exports = { environment };
