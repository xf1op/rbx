(() => {
  'use strict';
  const KEY = '__RoImprAccessoryLimit';
  if (window[KEY]) return;
  window[KEY] = true;

  const MAX_CLASSIC_ACCESSORIES = 10;
  const CLASSIC_3D_ACCESSORY_TYPES = new Set([8, 41, 42, 43, 44, 45, 46, 47, 57, 58]);
  const nativeDefineProperty = Object.defineProperty;
  const wrappedFunctions = new WeakMap();
  const hookedServices = new WeakSet();
  let enabled = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin ||
        event.data?.__roImprAccessoryLimitSetting !== true ||
        typeof event.data.enabled !== 'boolean') return;
    enabled = event.data.enabled;
  });

  function assetTypeId(asset) {
    const raw = asset?.assetType?.id ?? asset?.type?.id ?? asset?.assetTypeId;
    const id = Number(raw);
    return Number.isInteger(id) ? id : null;
  }

  function isClassic3DAccessory(asset) {
    return CLASSIC_3D_ACCESSORY_TYPES.has(assetTypeId(asset));
  }

  function wrapAddAssetToAvatar(original) {
    if (typeof original !== 'function') return original;
    const prior = wrappedFunctions.get(original);
    if (prior) return prior;

    const wrapped = new Proxy(original, {
      apply(target, thisArg, args) {
        const nativeCandidates = Reflect.apply(target, thisArg, args);
        if (!enabled || !Array.isArray(nativeCandidates) || !Array.isArray(args?.[1])) return nativeCandidates;

        const proposed = [args[0], ...args[1]];
        let slotsRemaining = MAX_CLASSIC_ACCESSORIES;
        const accepted = [];

        for (const asset of proposed) {
          if (isClassic3DAccessory(asset)) {
            if (slotsRemaining > 0) {
              slotsRemaining -= 1;
              accepted.push(asset);
            }
          } else if (nativeCandidates.includes(asset)) {
            accepted.push(asset);
          }
        }

        return accepted;
      }
    });

    wrappedFunctions.set(original, wrapped);
    return wrapped;
  }

  function wrapLimitFunction(original) {
    if (typeof original !== 'function') return original;
    const prior = wrappedFunctions.get(original);
    if (prior) return prior;

    const wrapped = new Proxy(original, {
      apply(target, thisArg, args) {
        if (enabled && CLASSIC_3D_ACCESSORY_TYPES.has(Number(args?.[0]))) return undefined;
        return Reflect.apply(target, thisArg, args);
      }
    });

    wrappedFunctions.set(original, wrapped);
    return wrapped;
  }

  function patchFunctionProperty(object, property, wrapper) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return false;

    let current;
    try { current = object[property]; } catch { current = null; }
    if (typeof current === 'function') {
      if (!wrappedFunctions.has(current)) {
        try { object[property] = wrapper(current); } catch { return false; }
      }
      return true;
    }

    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(object, property); } catch {}
    if (descriptor && descriptor.configurable === false) return false;

    let value = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    try {
      nativeDefineProperty(object, property, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() { return value; },
        set(next) { value = typeof next === 'function' ? wrapper(next) : next; }
      });
      return true;
    } catch {
      return false;
    }
  }

  function patchService(service) {
    if (!service || (typeof service !== 'object' && typeof service !== 'function')) return;
    if (hookedServices.has(service)) return;
    hookedServices.add(service);
    patchFunctionProperty(service, 'getAdvancedAccessoryLimit', wrapLimitFunction);
    patchFunctionProperty(service, 'addAssetToAvatar', wrapAddAssetToAvatar);
  }

  function watchProperty(object, property, callback) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return;

    let current;
    try { current = object[property]; } catch {}
    if (current != null) {
      callback(current);
      return;
    }

    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(object, property); } catch {}
    if (descriptor?.configurable === false) return;

    let stored = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    try {
      nativeDefineProperty(object, property, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() { return descriptor?.get ? descriptor.get.call(this) : stored; },
        set(value) {
          if (descriptor?.set) descriptor.set.call(this, value);
          else stored = value;
          let resolved = value;
          try { if (descriptor?.get) resolved = descriptor.get.call(this); } catch {}
          if (resolved != null) callback(resolved);
        }
      });
    } catch {}
  }

  function attachRobloxObject(robloxObject) {
    if (!robloxObject || (typeof robloxObject !== 'object' && typeof robloxObject !== 'function')) return;
    watchProperty(robloxObject, 'AvatarAccoutrementService', patchService);
  }

  watchProperty(window, 'Roblox', attachRobloxObject);
  if (window.Roblox) attachRobloxObject(window.Roblox);

  const definePropertyProxy = new Proxy(nativeDefineProperty, {
    apply(target, thisArg, args) {
      try {
        const [object, key, descriptor] = args;
        if (key === 'addAssetToAvatar' && descriptor) {
          const nextDescriptor = { ...descriptor };
          if (typeof descriptor.value === 'function') {
            nextDescriptor.value = wrapAddAssetToAvatar(descriptor.value);
          } else if (typeof descriptor.get === 'function') {
            const originalGetter = descriptor.get;
            nextDescriptor.get = function (...getterArgs) {
              const exported = Reflect.apply(originalGetter, this, getterArgs);
              return typeof exported === 'function' ? wrapAddAssetToAvatar(exported) : exported;
            };
          }
          args[2] = nextDescriptor;
        }
      } catch {}

      const result = Reflect.apply(target, thisArg, args);

      try {
        const [object, key, descriptor] = args;
        if (key === 'AvatarAccoutrementService') {
          const service = descriptor && 'value' in descriptor
            ? descriptor.value
            : object?.AvatarAccoutrementService;
          if (service) patchService(service);
        }
      } catch {}

      return result;
    }
  });

  try { Object.defineProperty = definePropertyProxy; } catch {}
})();
