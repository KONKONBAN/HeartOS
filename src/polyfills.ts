function define<T extends object>(target: T, name: string, value: unknown) {
  if (!(name in target)) Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

function at<T>(this: ArrayLike<T>, index: number): T | undefined {
  const len = this.length;
  const i = Math.trunc(index) || 0;
  const k = i < 0 ? len + i : i;
  return k < 0 || k >= len ? undefined : this[k];
}

define(Array.prototype, 'at', at);
define(String.prototype, 'at', at);
define(String.prototype, 'replaceAll', function (this: string, search: string | RegExp, replacement: string) {
  if (search instanceof RegExp) return this.replace(search, replacement);
  return this.split(search).join(replacement);
});
define(Object, 'hasOwn', (obj: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, key));

if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
  define(crypto, 'randomUUID', () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  });
}

function supportsFlexGap() {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  box.appendChild(document.createElement('div'));
  box.appendChild(document.createElement('div'));
  document.documentElement.appendChild(box);
  const ok = box.scrollHeight === 1;
  box.remove();
  return ok;
}

if (typeof document !== 'undefined' && !supportsFlexGap()) document.documentElement.classList.add('no-flex-gap');
