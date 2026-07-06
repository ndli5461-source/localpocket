# Local Pocket Reader - Architecture Documentation

## Overview

Local Pocket Reader is a browser extension that allows users to save articles locally and read them in a clean reader view. The extension supports multiple AI providers for summarization and provides advanced features like category management, favorites, and gesture controls.

## Architecture

### Extension Structure

```
local-pocket-reader-2.4.2/
├── core/                    # Core modules (shared functionality)
│   ├── loggerCore.js       # Centralized logging system
│   ├── validationCore.js   # Input validation and sanitization
│   ├── errorHandlerCore.js # Error handling with user-friendly messages
│   ├── stateManagementCore.js # Centralized state management
│   ├── commonUtilsCore.js  # Common utility functions
│   ├── storageManagerCore.js # Storage operations with batching/caching
│   ├── dedupeCore.js       # URL deduplication logic
│   ├── summaryPromptCore.js # AI summary prompt generation
│   ├── itemsMutationCore.js # Item mutation operations
│   ├── itemsIndexedDbCore.js # IndexedDB operations
│   ├── categoryAutoRuleCore.js # Automatic category assignment
│   ├── importCore.js       # Import/export functionality
│   ├── themeCore.js        # Theme management
│   └── aiContentScriptShared.js # AI content script shared logic
├── tests/                  # Unit and integration tests
│   └── core.test.js        # Core module tests
├── icons/                  # Extension icons
├── styles/                 # CSS stylesheets
├── background.js           # Background script (main logic)
├── contentScript.js        # Content script (page extraction)
├── contentScriptGpt.js     # ChatGPT-specific content script
├── contentScriptClaude.js  # Claude-specific content script
├── contentScriptSidebarAi.js # Generic AI sidebar content script
├── contentScriptSidebarUi.js # Sidebar UI content script
├── sidebar.js              # Sidebar logic
├── options.js              # Settings page logic
├── settings.js             # Settings definitions
├── floatingButton.js       # Floating button logic
├── floatingButtonFull.js   # Full floating button implementation
├── gesture-matcher.js      # Gesture recognition
├── gesture-settings.js     # Gesture settings UI
├── shortcutInterceptor.js  # Keyboard shortcut handling
├── aiOverlay.js           # AI overlay logic
├── overlay-wrapper.js     # Overlay wrapper
├── notesOverlay.js        # Notes overlay logic
├── notesEditorFrame.js    # Notes editor iframe
├── native-helper-setup.js  # Native helper setup
├── summaryHistory.js      # Summary history management
├── manifest.json          # Extension manifest
└── [HTML files]           # UI pages
```

## Core Modules

### LoggerCore (`core/loggerCore.js`)

**Purpose**: Centralized logging system with configurable log levels

**Features**:
- Log levels: DEBUG, INFO, WARN, ERROR, NONE
- Context-aware logging with timestamps
- Storage-based log level persistence
- Performance-optimized (no-op when disabled)

**Usage**:
```javascript
const logger = LocalPocketLoggerCore;
logger.setLogLevel('info');
logger.debug('Background', 'Processing item', item);
logger.error('Background', 'Failed to save', error);
```

### ValidationCore (`core/validationCore.js`)

**Purpose**: Input validation and sanitization

**Features**:
- URL validation with protocol restrictions
- Category name sanitization
- Title validation
- Settings value validation
- HTML sanitization (XSS prevention)
- Note content validation
- Domain exception pattern validation
- Gesture pattern validation

**Usage**:
```javascript
const validation = LocalPocketValidationCore;
const result = validation.validateUrl(userInput);
if (!result.valid) {
  console.error(result.error);
}
```

### ErrorHandlerCore (`core/errorHandlerCore.js`)

**Purpose**: Centralized error handling with user-friendly messages

**Features**:
- Error categorization (network, storage, validation, permission)
- User-friendly error messages
- Recovery strategies
- Error logging with context
- Error boundary for async operations
- Safe execution wrapper

**Usage**:
```javascript
const errorHandler = LocalPocketErrorHandlerCore;
const result = errorHandler.handleError(error, 'SaveOperation', {
  logger: logger,
  notify: true,
  notifyFn: showNotification
});
```

### StateManagementCore (`core/stateManagementCore.js`)

**Purpose**: Centralized state management with change notifications

**Features**:
- State store with subscription support
- Change notifications per key
- Cache manager with TTL support
- Namespaced stores
- Immutable state updates

**Usage**:
```javascript
const state = LocalPocketStateManagementCore.getStateStore();
state.set('items', newItems);
state.subscribe((changes) => {
  console.log('State changed:', changes);
}, ['items']);
```

### CommonUtilsCore (`core/commonUtilsCore.js`)

**Purpose**: Shared utility functions to reduce code duplication

**Features**:
- Extension API detection
- Storage helpers (get, set, remove)
- URL normalization
- URL comparison candidates (for deduplication)
- Debounce and throttle functions
- Unique ID generation
- Deep clone
- Safe JSON parse/stringify
- File size formatting
- Date formatting

**Usage**:
```javascript
const utils = LocalPocketCommonUtilsCore;
const normalized = utils.normalizeUrl(url);
const candidates = utils.buildUrlCompareCandidates(url);
```

### StorageManagerCore (`core/storageManagerCore.js`)

**Purpose**: Optimized storage operations with batching and caching

**Features**:
- Batching writes to reduce I/O
- Read caching with TTL
- Automatic cache expiration
- Batch flush control
- Cache invalidation

**Usage**:
```javascript
const storage = LocalPocketStorageManagerCore.getStorageManager({
  cacheEnabled: true,
  cacheTTL: 60000,
  batchEnabled: true,
  batchDelay: 100
});
await storage.set('items', items);
const data = await storage.get('items');
```

## Data Flow

### Saving an Article

1. **User Action**: User clicks save button or uses keyboard shortcut
2. **Content Script**: `contentScript.js` extracts page content
3. **Validation**: `ValidationCore` validates URL and content
4. **Background Script**: `background.js` processes the save request
5. **Deduplication**: `dedupeCore.js` checks for duplicates
6. **Storage**: `storageManagerCore.js` saves to storage
7. **State Update**: `stateManagementCore.js` updates state
8. **UI Update**: Sidebar/picker UI refreshes

### AI Summarization

1. **User Action**: User requests summary
2. **Provider Selection**: Sidebar opens AI provider (ChatGPT, Claude, etc.)
3. **Content Script**: `contentScriptSidebarAi.js` injects content
4. **Prompt Generation**: `summaryPromptCore.js` generates prompt
5. **AI Processing**: AI provider processes the request
6. **Result Storage**: Summary saved to storage
7. **History Update**: `summaryHistory.js` updates history

### Category Management

1. **User Action**: User creates/edits category
2. **Validation**: `ValidationCore` validates category name
3. **Auto-Rule**: `categoryAutoRuleCore.js` checks auto-assignment rules
4. **Storage**: Category saved to storage
5. **UI Update**: Category picker refreshes

## Key Components

### Background Script (`background.js`)

**Responsibilities**:
- Main extension logic
- Tab management
- Command handling
- Storage operations
- Notification management
- Context menu management
- Native messaging

**Size**: 30KB+ (needs modularization - see TODO)

### Content Script (`contentScript.js`)

**Responsibilities**:
- Page content extraction
- Thumbnail detection
- Title/author extraction
- Reading time calculation
- SPA navigation handling

**Optimizations**:
- Simplified Instagram extraction (reduced from 150+ to 40 lines)
- Lazy loading with requestIdleCallback
- Efficient DOM querying

### Sidebar (`sidebar.js`)

**Responsibilities**:
- Sidebar URL generation
- Provider configuration
- Storage operations
- Theme application

### Settings (`settings.js`)

**Responsibilities**:
- Settings definitions
- Default values
- Normalization functions
- Validation helpers

## Storage Schema

### Items
```javascript
{
  id: string,
  url: string,
  title: string,
  byline: string,
  siteName: string,
  faviconUrl: string,
  thumbnailUrl: string,
  excerpt: string,
  content: string,
  textContent: string,
  wordCount: number,
  readingTime: number,
  lang: string,
  time_added: number,
  categoryId: string,
  favorite: boolean
}
```

### Categories
```javascript
{
  id: string,
  name: string,
  hidden: boolean,
  order: number
}
```

### Settings
```javascript
{
  // 200+ settings options - see settings.js for full list
  showBadge: boolean,
  enableCategoryPicker: boolean,
  pageSize: number,
  themePreset: string,
  // ... many more
}
```

## Security Considerations

### Content Security Policy
- `script-src 'self'` - Only allow scripts from extension
- `object-src 'none'` - Block plugins
- `connect-src` - Restrict to AI provider domains
- `img-src` - Allow self, data:, https:, http:
- `frame-src` - Allow AI provider domains

### Input Validation
- All URLs validated before storage
- HTML content sanitized (XSS prevention)
- Category names sanitized
- Settings values validated

### Permissions
- `storage` - Local data storage
- `activeTab` - Access current tab
- `tabs` - Tab management
- `contextMenus` - Context menu integration
- `notifications` - User notifications
- `nativeMessaging` - Native helper integration
- `alarms` - Scheduled tasks
- `webRequest` - Request modification
- `cookies` - Cookie access
- `downloads` - Download management
- `<all_urls>` - Content script injection (TODO: reduce)

## Performance Optimizations

### Implemented
- Centralized logging (reduces console overhead)
- Storage batching (reduces I/O)
- Read caching (reduces storage calls)
- Simplified Instagram extraction (faster page load)
- Lazy loading with requestIdleCallback

### Planned
- Background.js modularization (reduce initial load)
- URL indexing incremental updates
- Image lazy loading in reader view

## Browser Compatibility

### Tested
- Firefox (primary target)
- Chrome (basic support)

### TODO
- Edge testing
- Safari testing
- Cross-browser polyfills

## Testing

### Unit Tests
- Core modules: `tests/core.test.js`
- Run with: `npx jest tests/core.test.js`

### Integration Tests
- TODO: Add Playwright tests for critical workflows

### E2E Tests
- TODO: Add extension lifecycle tests

## Development Guidelines

### Code Style
- Use JSDoc for public APIs
- English comments only (standardize from Malay/Indonesian mix)
- Follow existing naming conventions
- Keep functions focused and small

### Adding New Features
1. Add validation to `validationCore.js` if needed
2. Add logging using `loggerCore.js`
3. Handle errors with `errorHandlerCore.js`
4. Update state via `stateManagementCore.js`
5. Use `storageManagerCore.js` for storage
6. Add unit tests in `tests/core.test.js`

### Modifying Core Modules
1. Maintain backward compatibility
2. Update JSDoc comments
3. Add tests for new functionality
4. Update this documentation

## Migration Notes

### From Version 2.4.2 to 2.5.0

**New Core Modules**:
- `loggerCore.js` - Replaces scattered console.log
- `validationCore.js` - Centralized validation
- `errorHandlerCore.js` - Improved error handling
- `stateManagementCore.js` - Centralized state
- `commonUtilsCore.js` - Shared utilities
- `storageManagerCore.js` - Optimized storage

**Breaking Changes**:
- None (new modules are additive)

**Migration Steps**:
1. Update `manifest.json` to include new core modules
2. Replace console.log with logger calls (gradual)
3. Add validation to user inputs (gradual)
4. Use storage manager for new storage operations (gradual)

## Future Improvements

### High Priority
- Split background.js into smaller modules
- Reduce `<all_urls>` permission
- Improve accessibility (ARIA labels)
- Add integration tests

### Medium Priority
- Simplify settings UI (200+ options)
- Improve event handling (centralized)
- Modularize remaining functions
- Add user documentation

### Low Priority
- Standardize all comments to English
- Optimize URL indexing
- Add E2E tests
- Internationalization support

## Contributing

1. Follow the architecture patterns
2. Add tests for new features
3. Update documentation
4. Use existing core modules
5. Maintain backward compatibility

## License

See LICENSE file for details.
