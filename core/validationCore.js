/**
 * Input validation and sanitization utilities for Local Pocket Reader
 * Provides comprehensive validation for URLs, settings, categories, and user inputs
 */

(function attachLocalPocketValidationCore(globalScope) {
  'use strict';

  /**
   * Validate and sanitize a URL
   * @param {string} url - URL to validate
   * @param {Object} options - Validation options
   * @returns {Object} { valid: boolean, sanitized: string, error: string }
   */
  function validateUrl(url, options = {}) {
    const opts = {
      allowFileProtocol: false,
      allowDataProtocol: false,
      maxLength: 2000,
      ...options
    };

    if (typeof url !== 'string') {
      return { valid: false, sanitized: '', error: 'URL must be a string' };
    }

    const trimmed = url.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, sanitized: '', error: 'URL cannot be empty' };
    }

    if (trimmed.length > opts.maxLength) {
      return { valid: false, sanitized: '', error: 'URL exceeds maximum length' };
    }

    try {
      const parsed = new URL(trimmed);
      
      // Check protocol
      const allowedProtocols = ['http:', 'https:'];
      if (opts.allowFileProtocol) allowedProtocols.push('file:');
      if (opts.allowDataProtocol) allowedProtocols.push('data:');

      if (!allowedProtocols.includes(parsed.protocol)) {
        return { valid: false, sanitized: '', error: 'Protocol not allowed' };
      }

      // Sanitize by reconstructing URL
      parsed.hash = "";
      let sanitized = parsed.href;
      if (sanitized.endsWith("/")) {
        sanitized = sanitized.slice(0, -1);
      }
      
      return { valid: true, sanitized, error: null };
    } catch (err) {
      return { valid: false, sanitized: '', error: 'Invalid URL format' };
    }
  }

  /**
   * Validate category name
   * @param {string} name - Category name to validate
   * @returns {Object} { valid: boolean, sanitized: string, error: string }
   */
  function validateCategoryName(name) {
    if (typeof name !== 'string') {
      return { valid: false, sanitized: '', error: 'Category name must be a string' };
    }

    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, sanitized: '', error: 'Category name cannot be empty' };
    }

    if (trimmed.length > 120) {
      return { valid: false, sanitized: '', error: 'Category name exceeds maximum length' };
    }

    // Remove potentially dangerous characters
    const sanitized = trimmed
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim();

    if (sanitized.length === 0) {
      return { valid: false, sanitized: '', error: 'Category name contains only invalid characters' };
    }

    return { valid: true, sanitized, error: null };
  }

  /**
   * Validate item title
   * @param {string} title - Title to validate
   * @returns {Object} { valid: boolean, sanitized: string, error: string }
   */
  function validateTitle(title) {
    if (typeof title !== 'string') {
      return { valid: false, sanitized: '', error: 'Title must be a string' };
    }

    const trimmed = title.trim();
    
    if (trimmed.length === 0) {
      return { valid: true, sanitized: 'Untitled', error: null }; // Allow empty, use default
    }

    if (trimmed.length > 500) {
      return { valid: false, sanitized: '', error: 'Title exceeds maximum length' };
    }

    const sanitized = trimmed
      .replace(/[<>]/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();

    return { valid: true, sanitized, error: null };
  }

  /**
   * Validate settings value
   * @param {string} key - Settings key
   * @param {any} value - Value to validate
   * @param {any} defaultValue - Default value if invalid
   * @returns {any} Validated value or default
   */
  function validateSetting(key, value, defaultValue) {
    // Type-specific validation based on key
    const validators = {
      // Boolean settings
      showBadge: (v) => typeof v === 'boolean' ? v : defaultValue,
      showPageAction: (v) => typeof v === 'boolean' ? v : defaultValue,
      enableCategoryPicker: (v) => typeof v === 'boolean' ? v : defaultValue,
      enableDedupeButton: (v) => typeof v === 'boolean' ? v : defaultValue,
      deleteAfterOpen: (v) => typeof v === 'boolean' ? v : defaultValue,
      
      // String settings
      zoomLevel: (v) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(v) ? v : defaultValue,
      pickerAnimation: (v) => ['fade', 'slide', 'scale', 'none'].includes(v) ? v : defaultValue,
      pickerLayout: (v) => ['compact', 'cozy'].includes(v) ? v : defaultValue,
      
      // Number settings
      pageSize: (v) => {
        const num = parseInt(v, 10);
        return (Number.isFinite(num) && num >= 1 && num <= 100) ? num : defaultValue;
      },
      pickerAnimationDuration: (v) => {
        const num = parseInt(v, 10);
        return (Number.isFinite(num) && num >= 50 && num <= 2000) ? num : defaultValue;
      },
      trashLimit: (v) => {
        const num = parseInt(v, 10);
        return (Number.isFinite(num) && num >= 0) ? num : defaultValue;
      },
      
      // Array settings
      linkSavePinnedCategoryIds: (v) => Array.isArray(v) ? v : defaultValue,
      floatingButtonDomainExceptions: (v) => Array.isArray(v) ? v : defaultValue,
      
      // Object settings
      customThemeColors: (v) => (v && typeof v === 'object') ? v : defaultValue
    };

    const validator = validators[key];
    if (validator) {
      try {
        return validator(value);
      } catch (err) {
        return defaultValue;
      }
    }

    // Default: return value if it matches default type, else default
    return (typeof value === typeof defaultValue) ? value : defaultValue;
  }

  /**
   * Sanitize HTML content (basic XSS prevention)
   * @param {string} html - HTML content to sanitize
   * @returns {string} Sanitized HTML
   */
  function sanitizeHtml(html) {
    if (typeof html !== 'string') return '';
    
    // Remove script tags and event handlers
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '');
  }

  /**
   * Validate and sanitize note content
   * @param {string} content - Note content
   * @returns {Object} { valid: boolean, sanitized: string, error: string }
   */
  function validateNoteContent(content) {
    if (typeof content !== 'string') {
      return { valid: false, sanitized: '', error: 'Note content must be a string' };
    }

    if (content.length > 100000) { // 100KB limit
      return { valid: false, sanitized: '', error: 'Note content exceeds maximum length' };
    }

    const sanitized = sanitizeHtml(content);
    
    return { valid: true, sanitized, error: null };
  }

  /**
   * Validate domain exception pattern
   * @param {string} pattern - Domain pattern to validate
   * @returns {Object} { valid: boolean, sanitized: string, error: string }
   */
  function validateDomainException(pattern) {
    if (typeof pattern !== 'string') {
      return { valid: false, sanitized: '', error: 'Pattern must be a string' };
    }

    const trimmed = pattern.trim().toLowerCase();
    
    if (trimmed.length === 0) {
      return { valid: false, sanitized: '', error: 'Pattern cannot be empty' };
    }

    // Reject double-wildcard patterns like **, reject bare *
    if (/^\*\*/.test(trimmed) || trimmed === "*") {
      return { valid: false, sanitized: '', error: 'Invalid wildcard pattern' };
    }

    // Basic domain validation
    const domainPart = trimmed.replace(/^\*\./, '');
    if (!/^[a-z0-9.-]+$/.test(domainPart)) {
      return { valid: false, sanitized: '', error: 'Invalid domain format' };
    }

    return { valid: true, sanitized: trimmed, error: null };
  }

  /**
   * Validate gesture pattern
   * @param {Array} pattern - Gesture pattern array
   * @returns {Object} { valid: boolean, sanitized: Array, error: string }
   */
  function validateGesturePattern(pattern) {
    if (!Array.isArray(pattern)) {
      return { valid: false, sanitized: [], error: 'Pattern must be an array' };
    }

    if (pattern.length === 0) {
      return { valid: false, sanitized: [], error: 'Pattern cannot be empty' };
    }

    if (pattern.length > 10) {
      return { valid: false, sanitized: [], error: 'Pattern too long' };
    }

    for (const point of pattern) {
      if (!Array.isArray(point) || point.length !== 2) {
        return { valid: false, sanitized: [], error: 'Invalid point format' };
      }
      const [x, y] = point;
      if (typeof x !== 'number' || typeof y !== 'number') {
        return { valid: false, sanitized: [], error: 'Point coordinates must be numbers' };
      }
    }

    return { valid: true, sanitized: pattern, error: null };
  }

  const api = {
    validateUrl,
    validateCategoryName,
    validateTitle,
    validateSetting,
    sanitizeHtml,
    validateNoteContent,
    validateDomainException,
    validateGesturePattern
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope && typeof globalScope === 'object') {
    globalScope.LocalPocketValidationCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
