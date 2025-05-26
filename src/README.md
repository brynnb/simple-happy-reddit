# Simple Happy Reddit - Modular Structure

This application has been refactored into a modular structure for better maintainability and organization.

## Project Structure

```
src/
├── index.js                 # Main application entry point
├── database.js              # Database management
├── reddit-scraper.js        # Reddit API scraping logic
├── services/
│   └── post-service.js      # Post processing and business logic
├── templates/
│   └── html-template.js     # HTML generation and templating
└── utils/
    └── formatters.js        # Utility functions for formatting data
```

## Module Responsibilities

### `index.js`

- Express server setup and configuration
- Route handling
- Orchestrates the flow between modules
- Error handling

### `reddit-scraper.js`

- Handles Reddit API requests
- Processes raw Reddit data
- Returns structured post data for saving and display

### `utils/formatters.js`

- Score formatting (e.g., 1500 → 1.5k)
- Comment count formatting
- Self-text processing and HTML entity decoding
- Time formatting utilities
- Media type detection and processing

### `services/post-service.js`

- Transforms database posts for display
- Business logic for post processing
- Data transformation between database and UI formats

### `templates/html-template.js`

- HTML template generation
- Media HTML generation
- CSS and JavaScript for the frontend
- Complete page rendering

### `database.js`

- SQLite database operations
- Post storage and retrieval
- Database initialization and schema management

## Benefits of This Structure

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Maintainability**: Easier to locate and modify specific functionality
3. **Testability**: Individual modules can be tested in isolation
4. **Reusability**: Utility functions and services can be reused across the application
5. **Scalability**: New features can be added without modifying existing modules

## Usage

The application works exactly the same as before, but now with a cleaner, more organized codebase. Simply run:

```bash
npm start
```

The modular structure makes it easier to:

- Add new formatting functions to `utils/formatters.js`
- Modify the HTML template in `templates/html-template.js`
- Extend Reddit scraping functionality in `reddit-scraper.js`
- Add new post processing logic in `services/post-service.js`
