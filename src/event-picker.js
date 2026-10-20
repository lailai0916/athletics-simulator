let eventPicker = null;
function syncEventPicker() {
  if (!eventPicker) return;
  const { select, trigger, label, options } = eventPicker,
    current = EVENTS.find((e) => e.id === select.value);
  label.textContent = Locale.eventLabel(current);
  trigger.setAttribute('aria-label', Locale.text('choose') + ': ' + Locale.eventLabel(current));
  options.forEach((option) => {
    option.setAttribute('aria-selected', String(option.dataset.value === select.value));
    option.querySelector('span').textContent = Locale.eventLabel(
      EVENTS.find((event) => event.id === option.dataset.value)
    );
  });
}
function initEventPicker(select) {
  const root = $('event-picker'),
    trigger = $('event-picker-trigger'),
    menu = $('event-picker-list'),
    label = $('event-picker-label');
  const options = EVENTS.map((event) => {
    const option = document.createElement('div');
    option.id = 'event-option-' + event.id;
    option.className = 'event-picker-option';
    option.setAttribute('role', 'option');
    option.dataset.value = event.id;
    const text = document.createElement('span');
    text.textContent = Locale.eventLabel(event);
    option.append(text);
    option.insertAdjacentHTML(
      'beforeend',
      '<svg class="event-picker-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8 3 3 6-6"/></svg>'
    );
    menu.append(option);
    return option;
  });
  let active = -1,
    typeahead = '',
    typedAt = 0;
  eventPicker = { select, trigger, label, options };
  syncEventPicker();
  // Measure only when opening or when the viewport changes. The menu never
  // samples or repositions against the moving track underneath it.
  function placeMenu() {
    const viewport = window.visualViewport,
      originX = viewport?.offsetLeft || 0,
      originY = viewport?.offsetTop || 0;
    const width = viewport?.width || document.documentElement.clientWidth,
      height = viewport?.height || window.innerHeight,
      rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(228, Math.max(0, width - 24)),
      left = clamp(rect.left, originX + 12, originX + width - menuWidth - 12);
    const top = clamp(rect.bottom + 8, originY + 8, Math.max(originY + 8, originY + height - 56));
    menu.style.setProperty('--menu-left', left + 'px');
    menu.style.setProperty('--menu-top', top + 'px');
    menu.style.setProperty('--menu-width', menuWidth + 'px');
    menu.style.setProperty('--menu-height', Math.max(0, originY + height - top - 12) + 'px');
  }
  function keepVisible(option) {
    const top = option.offsetTop,
      bottom = top + option.offsetHeight;
    if (top < menu.scrollTop + 6) menu.scrollTop = Math.max(0, top - 6);
    else if (bottom > menu.scrollTop + menu.clientHeight - 6)
      menu.scrollTop = bottom - menu.clientHeight + 6;
  }
  function highlight(index, scroll = false) {
    const next = clamp(index, 0, options.length - 1);
    if (next !== active) {
      if (active >= 0) options[active].dataset.active = 'false';
      active = next;
      options[active].dataset.active = 'true';
      menu.setAttribute('aria-activedescendant', options[active].id);
    }
    if (scroll) keepVisible(options[active]);
  }
  function close(returnFocus = false) {
    menu.hidden = true;
    root.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    typeahead = '';
    if (returnFocus) trigger.focus({ preventScroll: true });
  }
  function open(index = options.findIndex((option) => option.dataset.value === select.value)) {
    menu.hidden = false;
    placeMenu();
    root.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    highlight(index, true);
    menu.focus({ preventScroll: true });
  }
  function choose(index) {
    const id = options[index].dataset.value,
      changed = id !== select.value;
    select.value = id;
    syncEventPicker();
    close(true);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function reposition() {
    if (!menu.hidden) {
      placeMenu();
      if (active >= 0) keepVisible(options[active]);
    }
  }
  function search(key) {
    const now = Date.now(),
      normalize = (value) => value.toLocaleLowerCase().replace(/\s/g, '').replace(/[×*]/g, 'x');
    typeahead = now - typedAt < 700 ? typeahead + normalize(key) : normalize(key);
    typedAt = now;
    const repeated = [...typeahead].every((char) => char === typeahead[0]),
      query = repeated ? typeahead[0] : typeahead,
      start = repeated ? active + 1 : active;
    let index = options.findIndex((_, i) =>
      normalize(
        Locale.eventLabel(EVENTS[(start + i + options.length) % options.length])
      ).startsWith(query)
    );
    if (index >= 0) highlight((start + index + options.length) % options.length, true);
  }
  trigger.addEventListener('click', () => (menu.hidden ? open() : close(true)));
  trigger.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      open(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : undefined);
    }
  });
  menu.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.isComposing) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      typeahead = '';
      const page = Math.max(1, Math.floor(menu.clientHeight / (options[0].offsetHeight || 44)) - 1);
      highlight(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : active +
              (event.key === 'PageDown'
                ? page
                : event.key === 'PageUp'
                  ? -page
                  : event.key === 'ArrowDown'
                    ? 1
                    : -1),
        true
      );
    } else if (event.key === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(true);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      search(event.key);
    }
  });
  options.forEach((option, index) => {
    option.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'touch' && !event.buttons) highlight(index);
    });
    option.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') event.preventDefault();
    });
    option.addEventListener('click', () => choose(index));
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !root.contains(event.target)) close();
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) close();
  });
  window.addEventListener('resize', reposition, { passive: true });
  window.visualViewport?.addEventListener('resize', reposition, { passive: true });
  window.visualViewport?.addEventListener('scroll', reposition, { passive: true });
  select.addEventListener('change', syncEventPicker);
}
