/**
 * Unit tests for Local Pocket Reader core modules
 * Run with: npm test (if Jest is configured) or node tests/core.test.js
 */

// Mock the global scope for testing
if (typeof globalThis === 'undefined') {
  global.globalThis = global;
}

// Load core modules
const LoggerCore = require('../core/loggerCore');
const ValidationCore = require('../core/validationCore');
const ErrorHandlerCore = require('../core/errorHandlerCore');
const StateManagementCore = require('../core/stateManagementCore');
const CommonUtilsCore = require('../core/commonUtilsCore');

describe('LoggerCore', () => {
  let logger;

  beforeEach(() => {
    logger = LoggerCore;
    logger.setLogLevel('info');
  });

  test('should set and get log level', () => {
    logger.setLogLevel('debug');
    expect(logger.getLogLevel()).toBe('debug');
  });

  test('should handle invalid log level', () => {
    logger.setLogLevel('invalid');
    expect(logger.getLogLevel()).toBe('info'); // Should default to info
  });

  test('should have correct log levels', () => {
    expect(logger.LOG_LEVELS.DEBUG).toBe(0);
    expect(logger.LOG_LEVELS.INFO).toBe(1);
    expect(logger.LOG_LEVELS.WARN).toBe(2);
    expect(logger.LOG_LEVELS.ERROR).toBe(3);
    expect(logger.LOG_LEVELS.NONE).toBe(4);
  });
});

describe('ValidationCore', () => {
  test('should validate valid URL', () => {
    const result = ValidationCore.validateUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('https://example.com');
    expect(result.error).toBeNull();
  });

  test('should reject invalid URL', () => {
    const result = ValidationCore.validateUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('should reject empty URL', () => {
    const result = ValidationCore.validateUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('should reject data URL by default', () => {
    const result = ValidationCore.validateUrl('data:text/plain,hello');
    expect(result.valid).toBe(false);
  });

  test('should allow data URL with option', () => {
    const result = ValidationCore.validateUrl('data:text/plain,hello', { allowDataProtocol: true });
    expect(result.valid).toBe(true);
  });

  test('should validate category name', () => {
    const result = ValidationCore.validateCategoryName('My Category');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('My Category');
  });

  test('should reject empty category name', () => {
    const result = ValidationCore.validateCategoryName('');
    expect(result.valid).toBe(false);
  });

  test('should sanitize HTML in category name', () => {
    const result = ValidationCore.validateCategoryName('<script>alert("xss")</script>');
    expect(result.valid).toBe(true);
    expect(result.sanitized).not.toContain('<script>');
  });

  test('should validate title', () => {
    const result = ValidationCore.validateTitle('My Article Title');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('My Article Title');
  });

  test('should handle empty title with default', () => {
    const result = ValidationCore.validateTitle('');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Untitled');
  });

  test('should validate boolean setting', () => {
    const result = ValidationCore.validateSetting('showBadge', true, false);
    expect(result).toBe(true);
  });

  test('should validate number setting', () => {
    const result = ValidationCore.validateSetting('pageSize', 25, 10);
    expect(result).toBe(25);
  });

  test('should reject invalid number setting', () => {
    const result = ValidationCore.validateSetting('pageSize', 150, 10);
    expect(result).toBe(10); // Should return default
  });

  test('should sanitize HTML', () => {
    const html = '<script>alert("xss")</script><p>Hello</p>';
    const sanitized = ValidationCore.sanitizeHtml(html);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('<p>Hello</p>');
  });

  test('should validate note content', () => {
    const result = ValidationCore.validateNoteContent('My note content');
    expect(result.valid).toBe(true);
  });

  test('should reject oversized note content', () => {
    const largeContent = 'x'.repeat(100001);
    const result = ValidationCore.validateNoteContent(largeContent);
    expect(result.valid).toBe(false);
  });

  test('should validate domain exception', () => {
    const result = ValidationCore.validateDomainException('*.example.com');
    expect(result.valid).toBe(true);
  });

  test('should validate gesture pattern', () => {
    const pattern = [[0, 0], [100, 100], [200, 200]];
    const result = ValidationCore.validateGesturePattern(pattern);
    expect(result.valid).toBe(true);
  });

  test('should reject invalid gesture pattern', () => {
    const result = ValidationCore.validateGesturePattern('not-an-array');
    expect(result.valid).toBe(false);
  });
});

describe('ErrorHandlerCore', () => {
  test('should categorize network error', () => {
    const error = new Error('Network request failed');
    const category = ErrorHandlerCore.categorizeError(error);
    expect(category).toBe(ErrorHandlerCore.ERROR_CATEGORIES.NETWORK);
  });

  test('should categorize storage error', () => {
    const error = new Error('Storage quota exceeded');
    const category = ErrorHandlerCore.categorizeError(error);
    expect(category).toBe(ErrorHandlerCore.ERROR_CATEGORIES.STORAGE);
  });

  test('should categorize permission error', () => {
    const error = new Error('Permission denied');
    const category = ErrorHandlerCore.categorizeError(error);
    expect(category).toBe(ErrorHandlerCore.ERROR_CATEGORIES.PERMISSION);
  });

  test('should get user-friendly message', () => {
    const error = new Error('Network request failed');
    const userMessage = ErrorHandlerCore.getUserMessage(error, 'TestContext');
    expect(userMessage.message).toBeTruthy();
    expect(userMessage.category).toBeTruthy();
    expect(userMessage.canRecover).toBeDefined();
  });

  test('should handle error', () => {
    const error = new Error('Test error');
    const result = ErrorHandlerCore.handleError(error, 'TestContext');
    expect(result.handled).toBe(true);
    expect(result.message).toBeTruthy();
  });

  test('should wrap function with error handling', async () => {
    const fn = () => { throw new Error('Test error'); };
    const wrapped = ErrorHandlerCore.withErrorHandling(fn, 'TestContext');
    
    await expect(wrapped()).rejects.toBeDefined();
  });

  test('should safe execute function', () => {
    const fn = () => { throw new Error('Test error'); };
    const result = ErrorHandlerCore.safeExecute(fn, 'default', 'TestContext');
    expect(result).toBe('default');
  });
});

describe('StateManagementCore', () => {
  let store;

  beforeEach(() => {
    store = new StateManagementCore.StateStore({ test: 'value' });
  });

  test('should get state', () => {
    expect(store.get('test')).toBe('value');
  });

  test('should get entire state', () => {
    const state = store.get();
    expect(state.test).toBe('value');
  });

  test('should set state value', () => {
    store.set('test', 'new value');
    expect(store.get('test')).toBe('new value');
  });

  test('should notify listeners on change', () => {
    let notified = false;
    store.subscribe((changes) => {
      notified = true;
    });
    store.set('test', 'new value');
    expect(notified).toBe(true);
  });

  test('should not notify on no change', () => {
    let notified = false;
    store.subscribe((changes) => {
      notified = true;
    });
    store.set('test', 'value'); // Same value
    expect(notified).toBe(false);
  });

  test('should unsubscribe listener', () => {
    let notified = false;
    const unsubscribe = store.subscribe((changes) => {
      notified = true;
    });
    unsubscribe();
    store.set('test', 'new value');
    expect(notified).toBe(false);
  });

  test('should reset state', () => {
    store.set('test', 'new value');
    store.reset({ test: 'reset' });
    expect(store.get('test')).toBe('reset');
  });

  test('should clear listeners', () => {
    store.subscribe(() => {});
    store.clearListeners();
    expect(store.listeners.size).toBe(0);
  });
});

describe('CacheManager', () => {
  let cache;

  beforeEach(() => {
    cache = new StateManagementCore.CacheManager(1000);
  });

  test('should set and get value', () => {
    cache.set('test', 'value');
    expect(cache.get('test')).toBe('value');
  });

  test('should return undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  test('should expire cache entry', (done) => {
    cache.set('test', 'value', 100); // 100ms TTL
    setTimeout(() => {
      expect(cache.get('test')).toBeUndefined();
      done();
    }, 150);
  });

  test('should get or set with factory', async () => {
    let factoryCalled = false;
    const factory = () => {
      factoryCalled = true;
      return Promise.resolve('value');
    };
    
    const result1 = await cache.getOrSet('test', factory, 1000);
    expect(factoryCalled).toBe(true);
    expect(result1).toBe('value');
    
    const result2 = await cache.getOrSet('test', factory, 1000);
    expect(factoryCalled).toBe(true); // Still true from first call
    expect(result2).toBe('value');
  });

  test('should invalidate cache entry', () => {
    cache.set('test', 'value');
    cache.invalidate('test');
    expect(cache.get('test')).toBeUndefined();
  });

  test('should clear all cache', () => {
    cache.set('test1', 'value1');
    cache.set('test2', 'value2');
    cache.clear();
    expect(cache.get('test1')).toBeUndefined();
    expect(cache.get('test2')).toBeUndefined();
  });
});

describe('CommonUtilsCore', () => {
  test('should get extension API', () => {
    const api = CommonUtilsCore.getExtensionApi();
    // In test environment, might return null or browser/chrome
    expect(api === null || typeof api === 'object').toBe(true);
  });

  test('should normalize URL', () => {
    const url = 'https://www.example.com/path/?utm_source=test#section';
    const normalized = CommonUtilsCore.normalizeUrl(url);
    expect(normalized).not.toContain('utm_source');
    expect(normalized).not.toContain('#section');
  });

  test('should build URL comparison candidates', () => {
    const candidates = CommonUtilsCore.buildUrlCompareCandidates('https://example.com/path');
    expect(candidates.size).toBeGreaterThan(1);
    expect(candidates.has('https://example.com/path')).toBe(true);
  });

  test('should debounce function', (done) => {
    let callCount = 0;
    const debounced = CommonUtilsCore.debounce(() => {
      callCount++;
    }, 100);
    
    debounced();
    debounced();
    debounced();
    
    setTimeout(() => {
      expect(callCount).toBe(1);
      done();
    }, 150);
  });

  test('should throttle function', (done) => {
    let callCount = 0;
    const throttled = CommonUtilsCore.throttle(() => {
      callCount++;
    }, 100);
    
    throttled();
    throttled();
    throttled();
    
    setTimeout(() => {
      expect(callCount).toBe(1);
      done();
    }, 150);
  });

  test('should generate unique ID', () => {
    const id1 = CommonUtilsCore.generateId();
    const id2 = CommonUtilsCore.generateId();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
  });

  test('should deep clone object', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = CommonUtilsCore.deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  test('should safe JSON parse', () => {
    const result = CommonUtilsCore.safeJsonParse('{"a": 1}');
    expect(result).toEqual({ a: 1 });
  });

  test('should handle invalid JSON', () => {
    const result = CommonUtilsCore.safeJsonParse('invalid', null);
    expect(result).toBeNull();
  });

  test('should safe JSON stringify', () => {
    const result = CommonUtilsCore.safeJsonStringify({ a: 1 });
    expect(result).toBe('{"a":1}');
  });

  test('should handle circular reference in stringify', () => {
    const obj = { a: 1 };
    obj.self = obj;
    const result = CommonUtilsCore.safeJsonStringify(obj, '{}');
    expect(result).toBe('{}');
  });

  test('should format file size', () => {
    expect(CommonUtilsCore.formatFileSize(0)).toBe('0 Bytes');
    expect(CommonUtilsCore.formatFileSize(1024)).toBe('1 KB');
    expect(CommonUtilsCore.formatFileSize(1048576)).toBe('1 MB');
  });

  test('should format date', () => {
    const now = new Date();
    const formatted = CommonUtilsCore.formatDate(now);
    expect(formatted).toBe('Just now');
  });
});

// Run tests if not using a test runner
if (typeof describe === 'undefined' || typeof test === 'undefined') {
  console.log('Tests require Jest or similar test runner');
  console.log('Install with: npm install --save-dev jest');
  console.log('Run with: npx jest tests/core.test.js');
}
