# Local Pocket Reader - User Guide

## Getting Started

Local Pocket Reader is a browser extension that lets you save articles locally and read them in a clean, distraction-free reader view. It also integrates with AI providers like ChatGPT, Claude, and Gemini for article summarization.

### Installation

1. Download the extension files
2. Load the extension in your browser:
   - **Firefox**: Open `about:debugging`, click "This Firefox", then "Load Temporary Add-on" and select `manifest.json`
   - **Chrome**: Open `chrome://extensions`, enable Developer mode, then click "Load unpacked" and select the extension folder

### Basic Usage

#### Saving Articles

**Method 1: Browser Action**
- Click the extension icon in your browser toolbar
- The current page will be saved to your Local Pocket

**Method 2: Keyboard Shortcut**
- Press `Alt+Shift+P` to save the current page
- Press `Alt+Shift+F` to save as favorite

**Method 3: Context Menu**
- Right-click on any link and select "Save to Local Pocket"

**Method 4: Category Picker**
- Press `Alt+A` to open the category picker
- Select a category to save the current page

#### Reading Articles

1. Open the category picker with `Alt+A`
2. Navigate with arrow keys or mouse
3. Press Enter or click to open an article
4. The article opens in a clean reader view

#### Using Categories

**Creating Categories**
- Open category picker with `Alt+A`
- Press `Alt+Shift+C` to create a new category
- Enter the category name

**Deleting Categories**
- Open category picker with `Alt+A`
- Press `Alt+Shift+D` to delete the current category

**Switching Categories**
- Press `Alt+Shift+Right` for next category
- Press `Alt+Shift+Left` for previous category

#### Favorites

**Toggle Favorites View**
- In category picker, press `Alt+F` to show only favorites

**Mark as Favorite**
- Save with `Alt+Shift+F` to mark as favorite
- Or toggle favorite status in the picker

## Features

### AI Summarization

Local Pocket Reader integrates with multiple AI providers for article summarization:

**Supported Providers**
- ChatGPT (chatgpt.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Perplexity (perplexity.ai)
- Copilot (copilot.microsoft.com)
- Grok (grok.com)
- DeepSeek (chat.deepseek.com)
- Poe (poe.com)
- Mistral (chat.mistral.ai)

**Using AI Summarization**
1. Save an article to Local Pocket
2. Open the AI sidebar with `Alt+Shift+I`
3. Select your preferred AI provider
4. The article content will be sent to the AI for summarization
5. Read the summary in the sidebar

**Summary Modes**
- **Quick**: Brief overview
- **Deep**: Detailed analysis with implications
- **Action Items**: Practical steps and checklist
- **Study Notes**: Learning-focused format
- **Research**: Research summary with methodology

### Notes

**Adding Notes**
- Press `Alt+Shift+O` to open the notes overlay
- Add notes to any saved article
- Notes are saved locally

**Organizing Notes**
- Create folders to organize your notes
- Search through your notes
- Export notes for backup

### Gestures

**Enabling Gestures**
- Go to Settings (Alt+R)
- Enable gesture controls
- Configure gesture sensitivity

**Using Gestures**
- Right-click and drag on any page
- Draw gestures to trigger actions
- Common gestures:
  - Draw right arrow: Next item
  - Draw left arrow: Previous item
  - Draw up arrow: Open current item
  - Draw down arrow: Close picker

### Keyboard Shortcuts

**Global Shortcuts**
- `Alt+Shift+P` - Save current page
- `Alt+Shift+F` - Save as favorite
- `Alt+Shift+G` - Open first item
- `Alt+Shift+U` - Open random item
- `Alt+Shift+Z` - Toggle random across all categories
- `Alt+A` - Open category picker
- `Alt+R` - Open settings
- `Alt+Shift+I` - Open AI sidebar
- `Alt+Shift+A` - Toggle AI overlay
- `Alt+Shift+O` - Toggle notes overlay

**Category Picker Shortcuts**
- `Alt+Shift+N` - Next item
- `Alt+Shift+R` - Open random item
- `Alt+Shift+V` - Save all tabs in window
- `Alt+Shift+C` - Create category
- `Alt+Shift+D` - Delete category
- `Alt+F` - Toggle favorites
- `'` - Open move-to-category palette
- Arrow keys - Navigate items
- Enter - Open selected item
- Escape - Close picker

## Settings

### Accessing Settings
- Press `Alt+R` to open settings
- Or click the extension icon and select "Options"

### Key Settings

**Display**
- Show badge on extension icon
- Show page action
- Enable category picker
- Zoom level (xs, sm, md, lg, xl)

**Reading**
- Font size
- Line height
- Theme (classic, ocean, sunset, modern, etc.)
- Custom theme colors

**Behavior**
- Delete after opening
- Enable deduplication button
- Auto-save delay
- Trash limit

**Shortcuts**
- Link save keyboard keys
- Link save mouse buttons
- Command palette shortcut

**AI**
- Sidebar AI provider
- Summary mode preference
- Prompt templates

**Gestures**
- Enable gesture controls
- Gesture sensitivity
- Custom gesture patterns

**Floating Button**
- Enable floating button
- Floating button icon
- Domain exceptions

## Tips and Tricks

### Efficient Saving
- Use `Alt+Shift+V` to save all tabs in a window at once
- Set up pinned categories for quick access
- Use favorites for important articles

### Better Reading
- Try different themes for comfortable reading
- Adjust zoom level for your screen
- Use the study notes mode for learning

### AI Integration
- Set your preferred AI provider in settings
- Use different summary modes for different purposes
- Create custom prompt templates for specific needs

### Organization
- Create categories by topic (e.g., "Work", "Personal", "Research")
- Use favorites to mark must-read articles
- Regularly clean up trash to manage storage

## Troubleshooting

### Article Not Saving
- Check if the page is a valid article (not a login page, etc.)
- Try saving with the context menu instead
- Check browser console for errors

### AI Sidebar Not Working
- Ensure you're logged into the AI provider
- Check your internet connection
- Verify the AI provider URL is correct in settings

### Category Picker Not Opening
- Check if the extension has proper permissions
- Try refreshing the page
- Check if another extension is blocking keyboard shortcuts

### Gestures Not Working
- Ensure gestures are enabled in settings
- Try adjusting gesture sensitivity
- Make sure you're right-clicking before dragging

## FAQ

**Q: Is my data private?**
A: Yes, all data is stored locally on your device. No data is sent to external servers except when using AI summarization features.

**Q: Can I sync my articles across devices?**
A: Currently, Local Pocket Reader stores data locally. You can export/import your data manually.

**Q: How do I backup my data?**
A: Go to Settings and use the Import/Export feature to backup your articles and settings.

**Q: Which AI provider should I use?**
A: It depends on your preference. ChatGPT and Claude are popular choices. You can change providers anytime in settings.

**Q: Can I use this on mobile?**
A: Local Pocket Reader is designed for desktop browsers. Mobile support may be added in the future.

**Q: How much storage does it use?**
A: Storage depends on the number and size of articles. You can set a trash limit in settings to automatically delete old items.

**Q: Can I customize the reader view?**
A: Yes, you can customize themes, fonts, and colors in the Settings menu.

**Q: What happens when I delete an article?**
A: Deleted articles go to trash. You can recover them from trash until the trash limit is reached.

## Advanced Features

### Auto-Rule Categories
Set up automatic rules to assign categories based on URL patterns or content.

### Import/Export
- Export your entire library as JSON
- Import from other pocket-like services
- Backup and restore your data

### Custom Themes
- Create custom color schemes
- Adjust contrast for different lighting
- Save theme presets

### Command Palette
- Press the configured shortcut (default: none)
- Quick access to all extension features
- Search and execute commands

## Support

For issues, feature requests, or contributions:
- Check the ARCHITECTURE.md for technical details
- Review the source code on GitHub (if available)
- Report bugs with browser console errors

## Version History

### Version 2.4.2
- Current version with all core features
- AI integration with multiple providers
- Gesture controls
- Notes system
- Category management

### Version 2.5.0 (Upcoming)
- Improved performance with centralized systems
- Better error handling
- Enhanced security
- Unit test coverage
- Optimized storage operations
