/**
 * Cross-browser polyfills for Local Pocket Reader
 * Ensures compatibility across Firefox, Chrome, Edge, and Safari
 */

(function attachLocalPocketPolyfillsCore(globalScope) {
  'use strict';

  /**
   * Apply all polyfills
   */
  function applyPolyfills() {
    // Array.prototype.includes polyfill for older browsers
    if (!Array.prototype.includes) {
      Array.prototype.includes = function(searchElement, fromIndex) {
        if (this == null) {
          throw new TypeError('"this" is null or not defined');
        }
        const O = Object(this);
        const len = O.length >>> 0;
        if (len === 0) return false;
        const n = fromIndex | 0;
        const k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
        for (let i = k; i < len; i++) {
          if (O[i] === searchElement) return true;
        }
        return false;
      };
    }

    // Array.prototype.find polyfill
    if (!Array.prototype.find) {
      Array.prototype.find = function(predicate, thisArg) {
        if (this == null) {
          throw new TypeError('"this" is null or not defined');
        }
        const O = Object(this);
        const len = O.length >>> 0;
        if (typeof predicate !== 'function') {
          throw new TypeError('predicate must be a function');
        }
        const thisArgValue = arguments.length > 1 ? thisArg : undefined;
        let k = 0;
        while (k < len) {
          const kValue = O[k];
          if (predicate.call(thisArgValue, kValue, k, O)) {
            return kValue;
          }
          k++;
        }
        return undefined;
      };
    }

    // Array.prototype.findIndex polyfill
    if (!Array.prototype.findIndex) {
      Array.prototype.findIndex = function(predicate, thisArg) {
        if (this == null) {
          throw new TypeError('"this" is null or not defined');
        }
        const O = Object(this);
        const len = O.length >>> 0;
        if (typeof predicate !== 'function') {
          throw new TypeError('predicate must be a function');
        }
        const thisArgValue = arguments.length > 1 ? thisArg : undefined;
        let k = 0;
        while (k < len) {
          const kValue = O[k];
          if (predicate.call(thisArgValue, kValue, k, O)) {
            return k;
          }
          k++;
        }
        return -1;
      };
    }

    // String.prototype.includes polyfill
    if (!String.prototype.includes) {
      String.prototype.includes = function(search, start) {
        if (typeof start !== 'number') start = 0;
        if (start + search.length > this.length) return false;
        return this.indexOf(search, start) !== -1;
      };
    }

    // String.prototype.startsWith polyfill
    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function(searchString, position) {
        position = position || 0;
        return this.indexOf(searchString, position) === position;
      };
    }

    // String.prototype.endsWith polyfill
    if (!String.prototype.endsWith) {
      String.prototype.endsWith = function(searchString, position) {
        const subjectString = this.toString();
        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
          position = subjectString.length;
        }
        position -= searchString.length;
        const lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
      };
    }

    // Object.assign polyfill
    if (typeof Object.assign !== 'function') {
      Object.assign = function(target) {
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        const to = Object(target);
        for (let index = 1; index < arguments.length; index++) {
          const nextSource = arguments[index];
          if (nextSource != null) {
            for (const nextKey in nextSource) {
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey];
              }
            }
          }
        }
        return to;
      };
    }

    // Promise polyfill (basic implementation)
    if (typeof Promise === 'undefined') {
      globalScope.Promise = (function() {
        function Promise(fn) {
          this.state = 'pending';
          this.value = undefined;
          this.handlers = [];
          
          const self = this;
          
          function resolve(result) {
            if (self.state !== 'pending') return;
            self.state = 'fulfilled';
            self.value = result;
            self.handlers.forEach(handle => handle.onFulfilled(result));
          }
          
          function reject(error) {
            if (self.state !== 'pending') return;
            self.state = 'rejected';
            self.value = error;
            self.handlers.forEach(handle => handle.onRejected(error));
          }
          
          try {
            fn(resolve, reject);
          } catch (e) {
            reject(e);
          }
        }
        
        Promise.prototype.then = function(onFulfilled, onRejected) {
          const self = this;
          return new Promise(function(resolve, reject) {
            self.handlers.push({
              onFulfilled: function(result) {
                try {
                  if (typeof onFulfilled === 'function') {
                    resolve(onFulfilled(result));
                  } else {
                    resolve(result);
                  }
                } catch (e) {
                  reject(e);
                }
              },
              onRejected: function(error) {
                try {
                  if (typeof onRejected === 'function') {
                    resolve(onRejected(error));
                  } else {
                    reject(error);
                  }
                } catch (e) {
                  reject(e);
                }
              }
            });
            
            if (self.state === 'fulfilled') {
              onFulfilled(self.value);
            } else if (self.state === 'rejected') {
              onRejected(self.value);
            }
          });
        };
        
        Promise.prototype.catch = function(onRejected) {
          return this.then(null, onRejected);
        };
        
        Promise.resolve = function(value) {
          return new Promise(function(resolve) {
            resolve(value);
          });
        };
        
        Promise.reject = function(error) {
          return new Promise(function(resolve, reject) {
            reject(error);
          });
        };
        
        Promise.all = function(promises) {
          return new Promise(function(resolve, reject) {
            const results = [];
            let completed = 0;
            
            if (promises.length === 0) {
              resolve(results);
              return;
            }
            
            promises.forEach(function(promise, index) {
              Promise.resolve(promise).then(function(result) {
                results[index] = result;
                completed++;
                if (completed === promises.length) {
                  resolve(results);
                }
              }, function(error) {
                reject(error);
              });
            });
          });
        };
        
        return Promise;
      })();
    }

    // requestIdleCallback polyfill
    if (typeof requestIdleCallback === 'undefined') {
      globalScope.requestIdleCallback = function(callback, options) {
        const start = Date.now();
        return setTimeout(function() {
          callback({
            didTimeout: false,
            timeRemaining: function() {
              return Math.max(0, 50 - (Date.now() - start));
            }
          });
        }, 1);
      };
      
      globalScope.cancelIdleCallback = function(id) {
        clearTimeout(id);
      };
    }

    // IntersectionObserver polyfill (basic)
    if (typeof IntersectionObserver === 'undefined') {
      globalScope.IntersectionObserver = function(callback, options) {
        this.callback = callback;
        this.options = options || {};
        this.elements = [];
      };
      
      globalScope.IntersectionObserver.prototype.observe = function(element) {
        this.elements.push(element);
        // Simple implementation - trigger callback immediately
        setTimeout(() => {
          this.callback([{
            target: element,
            isIntersecting: true,
            intersectionRatio: 1
          }]);
        }, 0);
      };
      
      globalScope.IntersectionObserver.prototype.unobserve = function(element) {
        const index = this.elements.indexOf(element);
        if (index > -1) {
          this.elements.splice(index, 1);
        }
      };
      
      globalScope.IntersectionObserver.prototype.disconnect = function() {
        this.elements = [];
      };
    }
  }

  /**
   * Detect browser
   * @returns {Object} Browser info
   */
  function detectBrowser() {
    const ua = navigator.userAgent;
    
    // Firefox
    if (ua.includes('Firefox')) {
      return {
        name: 'Firefox',
        isFirefox: true,
        isChrome: false,
        isEdge: false,
        isSafari: false
      };
    }
    
    // Edge (Chromium-based)
    if (ua.includes('Edg/')) {
      return {
        name: 'Edge',
        isFirefox: false,
        isChrome: false,
        isEdge: true,
        isSafari: false
      };
    }
    
    // Chrome/Chromium
    if (ua.includes('Chrome') && !ua.includes('Edg/')) {
      return {
        name: 'Chrome',
        isFirefox: false,
        isChrome: true,
        isEdge: false,
        isSafari: false
      };
    }
    
    // Safari
    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      return {
        name: 'Safari',
        isFirefox: false,
        isChrome: false,
        isEdge: false,
        isSafari: true
      };
    }
    
    // Unknown
    return {
      name: 'Unknown',
      isFirefox: false,
      isChrome: false,
      isEdge: false,
      isSafari: false
    };
  }

  /**
   * Check if browser supports a feature
   * @param {string} feature - Feature name
   * @returns {boolean} True if supported
   */
  function supportsFeature(feature) {
    const features = {
      webExtensions: typeof browser !== 'undefined' || typeof chrome !== 'undefined',
      promises: typeof Promise !== 'undefined',
      asyncAwait: (async function() {})() instanceof Promise,
      arrowFunctions: (() => {}) !== undefined,
      templateLiterals: `test` === 'test',
      destructuring: (() => { const {a} = {a: 1}; return a === 1; })(),
      spread: [...[1, 2, 3]].length === 3,
      classes: typeof class {} !== 'undefined',
      modules: typeof module !== 'undefined'
    };
    
    return features[feature] || false;
  }

  // Apply polyfills on load
  if (typeof window !== 'undefined') {
    applyPolyfills();
  }

  const api = {
    applyPolyfills,
    detectBrowser,
    supportsFeature
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketPolyfillsCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
