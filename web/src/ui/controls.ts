/** Small, framework-free DOM form-control builders used by Panel.ts. */

export interface ControlHandle<T> {
  el: HTMLElement;
  setValue(v: T): void;
}

function row(labelText: string): { row: HTMLDivElement; valueEl: HTMLSpanElement } {
  const r = document.createElement('div');
  r.className = 'control-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const valueEl = document.createElement('span');
  valueEl.className = 'control-value';
  label.appendChild(valueEl);
  r.appendChild(label);
  return { row: r, valueEl };
}

export function sliderControl(
  labelText: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
  format: (v: number) => string = (v) => v.toFixed(Math.abs(step) < 1 ? 2 : 0),
): ControlHandle<number> {
  const { row: r, valueEl } = row(labelText);
  valueEl.textContent = format(value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueEl.textContent = format(v);
    onChange(v);
  });
  r.appendChild(input);
  return {
    el: r,
    setValue(v: number) {
      input.value = String(v);
      valueEl.textContent = format(v);
    },
  };
}

export function colorControl(labelText: string, value: string, onChange: (v: string) => void): ControlHandle<string> {
  const { row: r, valueEl } = row(labelText);
  valueEl.textContent = value;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = value;
  input.addEventListener('input', () => {
    valueEl.textContent = input.value;
    onChange(input.value);
  });
  r.appendChild(input);
  return {
    el: r,
    setValue(v: string) {
      input.value = v;
      valueEl.textContent = v;
    },
  };
}

export function checkboxControl(labelText: string, value: boolean, onChange: (v: boolean) => void): ControlHandle<boolean> {
  const r = document.createElement('div');
  r.className = 'control-row control-row--checkbox';
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  label.appendChild(input);
  label.appendChild(document.createTextNode(' ' + labelText));
  r.appendChild(label);
  return {
    el: r,
    setValue(v: boolean) {
      input.checked = v;
    },
  };
}

export function selectControl<T extends string>(
  labelText: string,
  value: T,
  options: { value: T; label: string }[],
  onChange: (v: T) => void,
): ControlHandle<T> {
  const { row: r } = row(labelText);
  const select = document.createElement('select');
  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  r.appendChild(select);
  return {
    el: r,
    setValue(v: T) {
      select.value = v;
    },
  };
}

export function vectorControl(
  labelText: string,
  value: [number, number, number],
  onChange: (v: [number, number, number]) => void,
  step = 0.1,
): ControlHandle<[number, number, number]> {
  const r = document.createElement('div');
  r.className = 'control-row control-row--vector';
  const label = document.createElement('label');
  label.textContent = labelText;
  r.appendChild(label);
  const wrap = document.createElement('div');
  wrap.className = 'vector-inputs';
  const current: [number, number, number] = [...value];
  const inputs = ['X', 'Y', 'Z'].map((axis, i) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(step);
    input.value = String(value[i]);
    input.setAttribute('aria-label', `${labelText} ${axis}`);
    input.addEventListener('input', () => {
      current[i] = parseFloat(input.value) || 0;
      onChange([...current]);
    });
    wrap.appendChild(input);
    return input;
  });
  r.appendChild(wrap);
  return {
    el: r,
    setValue(v: [number, number, number]) {
      inputs.forEach((input, i) => {
        current[i] = v[i];
        input.value = String(v[i]);
      });
    },
  };
}

export function numberControl(
  labelText: string,
  value: number,
  onChange: (v: number) => void,
  opts: { min?: number; max?: number; step?: number } = {},
): ControlHandle<number> {
  const { row: r } = row(labelText);
  const input = document.createElement('input');
  input.type = 'number';
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  input.step = String(opts.step ?? 1);
  input.value = String(value);
  input.addEventListener('input', () => onChange(parseFloat(input.value) || 0));
  r.appendChild(input);
  return {
    el: r,
    setValue(v: number) {
      input.value = String(v);
    },
  };
}

export function textControl(labelText: string, value: string, onChange: (v: string) => void): ControlHandle<string> {
  const { row: r } = row(labelText);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', () => onChange(input.value));
  r.appendChild(input);
  return {
    el: r,
    setValue(v: string) {
      input.value = v;
    },
  };
}

export function sectionTitle(text: string): HTMLElement {
  const h = document.createElement('h3');
  h.className = 'section-title';
  h.textContent = text;
  return h;
}

export function sectionEl(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'panel-section';
  section.appendChild(sectionTitle(title));
  return section;
}
